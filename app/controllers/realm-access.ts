import { Roster } from '@prisma/client';
import { uniq } from 'lodash';
import prisma from 'utils/prisma';
import { createEvent } from 'utils/helpers';
import { EventEnum } from 'validators/create-realm';
import { fetchIdirUser } from 'controllers/msal';
import {
  addUserAsRealmAdmin,
  buildMasterUsername,
  ensureMasterRealmAdminGroup,
  removeUserAsRealmAdmin,
} from 'controllers/keycloak';

/**
 * The contacts that receive master realm access. The second technical contact is registry
 * metadata only and is deliberately not managed here.
 *
 * `idirField` holds the desired state and is written on every update; `guidField` holds the
 * observed state, the identity access was last successfully granted to, and only advances once
 * a sync converges across every environment.
 */
export const managedContacts = [
  {
    idirField: 'productOwnerIdirUserId',
    guidField: 'productOwnerGuid',
    emailField: 'productOwnerEmail',
    label: 'Product Owner',
  },
  {
    idirField: 'technicalContactIdirUserId',
    guidField: 'technicalContactGuid',
    emailField: 'technicalContactEmail',
    label: 'Technical Contact',
  },
] as const;

export type ManagedContact = (typeof managedContacts)[number];

export interface RealmAccessSyncResult {
  success: boolean;
  /** guids that hold access to the realm after this sync */
  granted: string[];
  /** guids whose access was removed by this sync */
  revoked: string[];
  /** managed contacts whose IDIR user id could not be resolved through MS Graph */
  unresolved: { field: string; idirUserId: string }[];
  errors: { env: string; error: string }[];
}

/**
 * Resolves an IDIR user id to the guid keycloak identifies the user by. Returns null when the
 * user has no Entra account, which means they can no longer log in.
 */
export const resolveIdirGuid = async (idirUserId?: string | null): Promise<string | null> => {
  if (!idirUserId) return null;
  const user = await fetchIdirUser({ userId: idirUserId });
  if (!user || !user.guid) return null;
  return user.guid.toLowerCase();
};

const errorMessage = (err: any) => (err instanceof Error ? err.message : String(err));

/**
 * The single writer for realm admin access. Reconciles the realm's master realm access against
 * its managed contacts: grants the identity each contact currently resolves to, and revokes the
 * identity that contact previously resolved to.
 *
 * Grants run before revokes so a realm is never left without an admin, and an identity that
 * still occupies the other managed slot is never revoked.
 *
 * The guid columns only advance on full convergence, so a failed sync leaves the row describing
 * exactly what still needs to happen and a retry re-runs every environment. Grant and revoke are
 * idempotent, so environments that already converged are no-ops.
 */
export const syncRealmAccess = async (realmId: number, idirUserId?: string): Promise<RealmAccessSyncResult> => {
  const realm = await prisma.roster.findUnique({ where: { id: realmId } });
  if (!realm) throw new Error(`Failed to find realm with id ${realmId}`);
  if (!realm.realm) throw new Error(`Realm with id ${realmId} has no realm name`);

  const realmName = realm.realm;
  const envs = realm.environments ?? [];

  // resolve
  const slots = await Promise.all(
    managedContacts.map(async (contact) => {
      const contactIdirUserId = realm[contact.idirField];
      return {
        ...contact,
        idirUserId: contactIdirUserId,
        desiredGuid: await resolveIdirGuid(contactIdirUserId),
        observedGuid: realm[contact.guidField]?.toLowerCase() ?? null,
      };
    }),
  );

  const unresolved = slots
    .filter((slot) => slot.idirUserId && !slot.desiredGuid)
    .map((slot) => ({ field: slot.idirField, idirUserId: slot.idirUserId as string }));

  // plan
  const desiredGuids = uniq(slots.map((slot) => slot.desiredGuid).filter(Boolean) as string[]);
  const toRevoke = uniq(
    slots
      .filter(
        (slot) =>
          slot.observedGuid && slot.observedGuid !== slot.desiredGuid && !desiredGuids.includes(slot.observedGuid),
      )
      .map((slot) => slot.observedGuid as string),
  );

  // apply
  const errors: { env: string; error: string }[] = [];

  for (const env of envs) {
    try {
      await ensureMasterRealmAdminGroup(env, realmName);

      for (const guid of desiredGuids) {
        await addUserAsRealmAdmin(buildMasterUsername(guid), [env], realmName);
      }

      await removeUserAsRealmAdmin(toRevoke, [env], realmName);
    } catch (err) {
      console.error(`Failed to sync access for realm ${realmName} in ${env}`, err);
      errors.push({ env, error: errorMessage(err) });
    }
  }

  // commit
  const success = errors.length === 0 && unresolved.length === 0;
  const result: RealmAccessSyncResult = { success, granted: desiredGuids, revoked: toRevoke, unresolved, errors };

  if (success) {
    await prisma.roster.update({
      where: { id: realmId },
      data: {
        ...Object.fromEntries(slots.map((slot) => [slot.guidField, slot.desiredGuid])),
        accessSyncFailedAt: null,
      },
    });
  } else {
    await prisma.roster.update({
      where: { id: realmId },
      data: { accessSyncFailedAt: new Date() },
    });
  }

  await createEvent({
    realmId,
    eventCode: success ? EventEnum.REQUEST_ACCESS_SYNC_SUCCESS : EventEnum.REQUEST_ACCESS_SYNC_FAILED,
    idirUserId,
    details: {
      environments: envs,
      contacts: slots.map((slot) => ({
        field: slot.idirField,
        idirUserId: slot.idirUserId,
        observedGuid: slot.observedGuid,
        desiredGuid: slot.desiredGuid,
      })),
      revoked: toRevoke,
      unresolved,
      errors,
    },
  });

  return result;
};

/**
 * Whether a managed contact's IDIR user id changed between the stored realm and an update.
 * IDIR user id is the identity; email is metadata that can change for the same person, so an
 * email-only edit never touches keycloak.
 */
export const getChangedManagedContacts = (current: Roster, update: Record<string, any>) =>
  managedContacts.filter((contact) => {
    const next = update[contact.idirField];
    if (next === undefined) return false;
    return String(next).toLowerCase() !== String(current[contact.idirField] ?? '').toLowerCase();
  });
