import { Prisma, Roster, User, UserRoster } from '@prisma/client';
import { omit } from 'lodash';
import prisma from 'utils/prisma';
import { syncUserAccess } from 'controllers/keycloak';
import { DirectoryUser, fetchIdirUserByAzureId } from 'controllers/msal';
import { MAX_ADDITIONAL_USERS, MemberRoleEnum } from 'utils/constants';
import { StatusEnum } from 'validators/create-realm';

export { MAX_ADDITIONAL_USERS, MemberRoleEnum };

export const memberRoleLabels: { [key: string]: string } = {
  [MemberRoleEnum.PRODUCT_OWNER]: 'Product Owner',
  [MemberRoleEnum.TECHNICAL_LEAD]: 'Technical Lead',
  [MemberRoleEnum.ADDITIONAL]: 'Additional User',
};

export type MemberWithUser = UserRoster & { user: User };

/**
 * What the client is allowed to send for a member. A previously saved member is
 * referenced by `userId`; a fresh pick from the directory search sends `azureId`.
 * Any guid, username or email in the payload is ignored.
 */
export interface MemberInput {
  userId?: number;
  azureId?: string;
}

export interface MembershipInput {
  productOwner: MemberInput;
  technicalLead: MemberInput;
  additionalUsers?: MemberInput[];
}

export interface DesiredMember {
  user: User;
  role: MemberRoleEnum;
}

export interface AccessSyncFailure {
  idirUsername: string;
  env: string;
  action: 'add' | 'remove';
  error: string;
}

export interface ReconcileResult {
  /** False when the realm does not exist in Keycloak yet, so nothing was attempted. */
  provisioned: boolean;
  added: MemberWithUser[];
  removed: MemberWithUser[];
  failures: AccessSyncFailure[];
}

/** Raised for member payloads the caller should be told about, rather than 500ing on. */
export class MemberValidationError extends Error {}

const errorMessage = (err: any) => err?.response?.data?.errorMessage || err?.message || String(err);

/**
 * Writes the directory record into `users`. Matches on guid first, then falls back to
 * the username so that a historical contact backfilled without a guid is upgraded in
 * place rather than colliding with the unique index on lower(idir_username).
 */
const upsertUser = async (directoryUser: DirectoryUser & { guid: string }) => {
  const data = {
    guid: directoryUser.guid,
    idirUsername: directoryUser.idirUsername,
    email: directoryUser.email,
    displayName: directoryUser.displayName,
    resolvedAt: new Date(),
  };

  const existing =
    (await prisma.user.findUnique({ where: { guid: directoryUser.guid } })) ??
    (await prisma.user.findFirst({
      where: { idirUsername: { equals: directoryUser.idirUsername, mode: 'insensitive' } },
    }));

  if (existing) return prisma.user.update({ where: { id: existing.id }, data });
  return prisma.user.create({ data });
};

const resolveMember = async (input: MemberInput, slot: string): Promise<User> => {
  if (input?.azureId) {
    const directoryUser = await fetchIdirUserByAzureId(input.azureId);
    if (!directoryUser) throw new MemberValidationError(`${slot} could not be found in the directory`);
    if (!directoryUser.guid) {
      throw new MemberValidationError(`${slot} has no IDIR guid in the directory and cannot be granted access`);
    }
    return upsertUser({ ...directoryUser, guid: directoryUser.guid });
  }

  if (input?.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new MemberValidationError(`${slot} is not a known user`);
    if (!user.guid) throw new MemberValidationError(`${slot} has never been resolved in the directory`);
    return user;
  }

  throw new MemberValidationError(`${slot} is required`);
};

/**
 * Turns the request payload into the desired membership, re-resolving every freshly
 * picked account against Graph. Lookups are sequential to keep Graph traffic modest on
 * a bulk edit.
 */
export const resolveMembership = async (input: MembershipInput): Promise<DesiredMember[]> => {
  const additionalUsers = input.additionalUsers ?? [];
  if (additionalUsers.length > MAX_ADDITIONAL_USERS) {
    throw new MemberValidationError(`A realm may have at most ${MAX_ADDITIONAL_USERS} additional users`);
  }

  const desired: DesiredMember[] = [
    { user: await resolveMember(input.productOwner, 'Product owner'), role: MemberRoleEnum.PRODUCT_OWNER },
    { user: await resolveMember(input.technicalLead, 'Technical lead'), role: MemberRoleEnum.TECHNICAL_LEAD },
  ];

  for (let index = 0; index < additionalUsers.length; index += 1) {
    desired.push({
      user: await resolveMember(additionalUsers[index], `Additional user ${index + 1}`),
      role: MemberRoleEnum.ADDITIONAL,
    });
  }

  const seen = new Set<number>();
  for (const member of desired) {
    if (seen.has(member.user.id)) {
      throw new MemberValidationError(`${member.user.idirUsername} cannot occupy more than one membership slot`);
    }
    seen.add(member.user.id);
  }

  return desired;
};

/**
 * Reconciles stored membership against the desired state. Ended memberships are
 * tombstoned rather than deleted: the tombstone is the only record that access was
 * granted through this form and must therefore be withdrawn, which "absent from
 * users_rosters" cannot distinguish from a legacy manual grant.
 *
 * Returns the ids of the rows that changed, so a save can reconcile just those.
 */
export const applyMembershipChanges = async (rosterId: number, desired: DesiredMember[]) => {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const current = await tx.userRoster.findMany({ where: { rosterId, removedAt: null } });
    const changedIds: number[] = [];
    const addedIds: number[] = [];
    const removedIds: number[] = [];

    // Removals are written first: a member changing slot would otherwise trip the
    // partial unique index on live membership.
    for (const row of current) {
      const stillDesired = desired.some((d) => d.user.id === row.userId && d.role === row.role);
      if (stillDesired) continue;
      await tx.userRoster.update({ where: { id: row.id }, data: { removedAt: now } });
      removedIds.push(row.id);
    }

    for (const member of desired) {
      const existing = current.find((row) => row.userId === member.user.id && row.role === member.role);
      if (existing) continue;
      const created = await tx.userRoster.create({
        data: { rosterId, userId: member.user.id, role: member.role },
      });
      addedIds.push(created.id);
    }

    changedIds.push(...removedIds, ...addedIds);
    return { changedIds, addedIds, removedIds };
  });
};

/** A realm only exists in Keycloak once it has been approved and applied. */
export const isRealmProvisioned = (roster: Pick<Roster, 'approved' | 'status' | 'archived' | 'realm'>) =>
  Boolean(roster.realm) && roster.approved === true && roster.status === StatusEnum.APPLIED && !roster.archived;

const syncMemberAcrossEnvs = async (
  realmName: string,
  envs: string[],
  member: MemberWithUser,
  action: 'add' | 'remove',
) => {
  const failures: AccessSyncFailure[] = [];

  for (const env of envs) {
    try {
      await syncUserAccess(realmName, env, member.user.guid as string, action);
    } catch (err) {
      console.error(`Failed to ${action} ${member.user.idirUsername} on ${realmName} in ${env}`, err);
      failures.push({ idirUsername: member.user.idirUsername, env, action, error: errorMessage(err) });
    }
  }

  return failures;
};

/**
 * Brings Keycloak in line with stored membership. Every operation is idempotent, so a
 * retry may safely re-run environments that already succeeded.
 *
 * `synced_at` / `revoked_at` are only stamped once every environment succeeded, which
 * is exactly what the manual sync button later picks up.
 */
export const reconcileRealmAccess = async (
  roster: Roster,
  opts: { memberIds?: number[] } = {},
): Promise<ReconcileResult> => {
  const empty: ReconcileResult = { provisioned: true, added: [], removed: [], failures: [] };
  if (!isRealmProvisioned(roster)) return { ...empty, provisioned: false };
  if (opts.memberIds && opts.memberIds.length === 0) return empty;

  const where: Prisma.UserRosterWhereInput = {
    rosterId: roster.id,
    // Contacts that never resolved in the directory have no provisioning key.
    user: { guid: { not: null } },
    OR: [
      { removedAt: null, syncedAt: null },
      { removedAt: { not: null }, revokedAt: null },
    ],
  };
  if (opts.memberIds) where.id = { in: opts.memberIds };

  const pending = await prisma.userRoster.findMany({ where, include: { user: true }, orderBy: { id: 'asc' } });
  if (pending.length === 0) return empty;

  const liveMembers = await prisma.userRoster.findMany({
    where: { rosterId: roster.id, removedAt: null },
    select: { userId: true },
  });
  const liveUserIds = new Set(liveMembers.map((member) => member.userId));

  const realmName = roster.realm as string;
  const envs = roster.environments ?? [];
  const result: ReconcileResult = { provisioned: true, added: [], removed: [], failures: [] };

  for (const member of pending.filter((member) => member.removedAt !== null)) {
    if (liveUserIds.has(member.userId)) {
      // Removed and re-added before the sync ran; there is nothing left to withdraw.
      await prisma.userRoster.update({ where: { id: member.id }, data: { revokedAt: new Date() } });
      continue;
    }

    const failures = await syncMemberAcrossEnvs(realmName, envs, member, 'remove');
    if (failures.length > 0) {
      result.failures.push(...failures);
      continue;
    }
    await prisma.userRoster.update({ where: { id: member.id }, data: { revokedAt: new Date() } });
    result.removed.push(member);
  }

  for (const member of pending.filter((member) => member.removedAt === null)) {
    const failures = await syncMemberAcrossEnvs(realmName, envs, member, 'add');
    if (failures.length > 0) {
      result.failures.push(...failures);
      continue;
    }
    await prisma.userRoster.update({ where: { id: member.id }, data: { syncedAt: new Date() } });
    result.added.push(member);
  }

  return result;
};

/**
 * Strips realm admin access for every member when a realm is archived. Membership rows
 * survive so that a restore can re-provision them; clearing `synced_at` is what makes
 * the restore reconcile pick them back up.
 */
export const revokeAllRealmAccess = async (roster: Roster) => {
  const members = await getRealmMembers(roster.id);
  const failures: AccessSyncFailure[] = [];

  for (const member of members) {
    if (!member.user.guid) continue;
    failures.push(...(await syncMemberAcrossEnvs(roster.realm as string, roster.environments ?? [], member, 'remove')));
  }

  await prisma.userRoster.updateMany({
    where: { rosterId: roster.id, removedAt: null },
    data: { syncedAt: null },
  });

  return failures;
};

/**
 * Pure database predicate for pending access work; no Keycloak calls. Members who never
 * resolved in the directory are excluded, since no amount of syncing can settle them.
 *
 * This is separate from the realm level `outOfSync` check, which asks whether the realm
 * itself exists and is enabled.
 */
export const needsSync = (members: MemberWithUser[]) =>
  members.some(
    (member) =>
      member.user.guid !== null &&
      ((member.removedAt === null && member.syncedAt === null) ||
        (member.removedAt !== null && member.revokedAt === null)),
  );

export const countUnresolvedMembers = (members: MemberWithUser[]) =>
  members.filter((member) => member.removedAt === null && member.user.guid === null).length;

export const getRealmMembers = (rosterId: number): Promise<MemberWithUser[]> =>
  prisma.userRoster.findMany({
    where: { rosterId, removedAt: null },
    include: { user: true },
    orderBy: { id: 'asc' },
  });

/** Recipients for realm-wide notifications: everyone currently holding access. */
export const memberEmails = (members: MemberWithUser[]) => {
  const emails = members.map((member) => member.user.email).filter(Boolean) as string[];
  return Array.from(new Set(emails));
};

/** Recipients for membership change notifications: the product owner and technical lead. */
export const leadEmails = (members: MemberWithUser[]) => {
  const emails = members
    .filter((member) => member.role !== MemberRoleEnum.ADDITIONAL)
    .map((member) => member.user.email)
    .filter(Boolean) as string[];
  return Array.from(new Set(emails));
};

/**
 * The role a user holds on a realm, or null if they hold none. Additional users are
 * view only, so callers gate edits on this being a product owner or technical lead.
 */
export const getUserRoleOnRealm = async (rosterId: number, idirUsername: string) => {
  if (!idirUsername) return null;

  const membership = await prisma.userRoster.findFirst({
    where: {
      rosterId,
      removedAt: null,
      user: { idirUsername: { equals: idirUsername, mode: 'insensitive' } },
    },
  });

  return (membership?.role as MemberRoleEnum) ?? null;
};

export const canEditRealm = (role: MemberRoleEnum | null, isAdmin: boolean) =>
  isAdmin || role === MemberRoleEnum.PRODUCT_OWNER || role === MemberRoleEnum.TECHNICAL_LEAD;

/** Prisma filter for the realms a user can see: any live membership, in any role. */
export const memberOfRealmFilter = (idirUsername: string): Prisma.RosterWhereInput => ({
  members: {
    some: {
      removedAt: null,
      user: { idirUsername: { equals: idirUsername, mode: 'insensitive' } },
    },
  },
});

export interface SerializedMember {
  id: number;
  userId: number;
  role: string;
  idirUsername: string;
  email: string | null;
  displayName: string | null;
  /** Null when the contact could not be resolved in the directory. */
  resolvedAt: string | null;
  syncedAt: string | null;
}

/** Client-facing shape. The guid never leaves the server. */
export const serializeMembers = (members: MemberWithUser[]): SerializedMember[] =>
  members.map((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role,
    idirUsername: member.user.idirUsername,
    email: member.user.email,
    displayName: member.user.displayName,
    resolvedAt: member.user.resolvedAt?.toISOString() ?? null,
    syncedAt: member.syncedAt?.toISOString() ?? null,
  }));

/**
 * Roster columns superseded by `users_rosters`. They are still written by nothing and
 * read by nothing, and are dropped in a follow up change once the migration is verified.
 */
export const retiredContactFields = [
  'productOwnerEmail',
  'productOwnerIdirUserId',
  'technicalContactEmail',
  'technicalContactIdirUserId',
  'secondTechnicalContactEmail',
  'secondTechnicalContactIdirUserId',
];

/** A roster plus its live membership, with tombstones and guids left behind. */
export const serializeRoster = (roster: Roster, members: MemberWithUser[]) => ({
  ...omit(roster, retiredContactFields),
  members: serializeMembers(members.filter((member) => member.removedAt === null)),
});
