import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { adminOnlyFields, allowedFormFields, checkAdminRole, createEvent } from 'utils/helpers';
import prisma from 'utils/prisma';
import KeycloakCore from 'utils/keycloak-core';
import { EventEnum, StatusEnum, createRealmSchema } from 'validators/create-realm';
import { ValidationError } from 'yup';
import { omit, pick, kebabCase } from 'lodash';
import { sendCreateEmail } from 'utils/mailer';
import RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation';
import { Prisma, Roster, User, UserRoster } from '@prisma/client';
import {
  MemberValidationError,
  applyMembershipChanges,
  countUnresolvedMembers,
  diffMembers,
  getRealmMembers,
  memberOfRealmFilter,
  needsSync,
  resolveMembership,
  serializeMembers,
  serializeRoster,
} from 'controllers/user-access';

type EnvironmentRealmData = {
  dev: RealmRepresentation[];
  test: RealmRepresentation[];
  prod: RealmRepresentation[];
};

type OutOfSyncDetails = { dev: string; test: string; prod: string };

type RosterWithMembers = Roster & { members: (UserRoster & { user: User })[] };

/**
 * Adds an outOfSync and outOfSync details section to rosters indicating their sync status with keycloak
 */
const checkRosterSync = <T extends { realm?: string | null; status?: string | null; archived?: boolean | null }>(
  rosters: T[],
  realms: EnvironmentRealmData,
) => {
  return rosters.map((roster) => {
    let synced = true;
    let details: OutOfSyncDetails = { dev: '', test: '', prod: '' };
    if (roster.status === 'pending') {
      return { ...roster, outOfSync: false };
    }
    for (const env of ['dev', 'test', 'prod']) {
      const foundRealm = realms[env as keyof EnvironmentRealmData].find((realm) => realm.realm === roster.realm);
      if (!foundRealm) {
        details[env as keyof OutOfSyncDetails] = `Realm ${roster.realm} not found in environment ${env}`;
        synced = false;
      } else {
        if (foundRealm.enabled && roster.archived) {
          details[
            env as keyof OutOfSyncDetails
          ] = `Realm ${roster.realm} is listed as archived, but still enabled in the ${env} environment.`;
          synced = false;
        } else if (!foundRealm.enabled && !roster.archived) {
          details[
            env as keyof OutOfSyncDetails
          ] = `Realm ${roster.realm} is listed as active, but disabled in the ${env} environment.`;
          synced = false;
        }
      }
    }
    if (!synced) {
      return { ...roster, outOfSync: true, outOfSyncDetails: details };
    } else {
      return { ...roster, outOfSync: false };
    }
  });
};

export const getAllRealms = async (username: string, isAdmin: boolean, excludeArchived: boolean = false) => {
  const where: Prisma.RosterWhereInput = {};
  if (excludeArchived) where.archived = false;
  // Additional users see their realms here, but cannot edit them.
  if (!isAdmin) Object.assign(where, memberOfRealmFilter(username));

  const rosters = (await prisma.roster.findMany({
    where,
    orderBy: { id: 'desc' },
    include: { members: { include: { user: true }, orderBy: { id: 'asc' } } },
  })) as RosterWithMembers[];

  if (!isAdmin) {
    return rosters.map(({ members, ...roster }) => omit(serializeRoster(roster, members), adminOnlyFields));
  }

  let realms: EnvironmentRealmData = { dev: [], test: [], prod: [] };
  for (const env of ['dev', 'test', 'prod']) {
    const kcClient = await new KeycloakCore(env);
    await kcClient.getAdminClient();
    realms[env as keyof EnvironmentRealmData] = await kcClient.getRealms();
  }

  // `needsSync` is membership level and needs no Keycloak calls; `outOfSync` asks
  // whether the realm itself exists and is enabled. They are deliberately separate.
  const serialized = rosters.map(({ members, ...roster }) => ({
    ...serializeRoster(roster, members),
    needsSync: needsSync(members),
    unresolvedMemberCount: countUnresolvedMembers(members),
  }));

  return checkRosterSync(serialized, realms);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let username;
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    username = session?.user?.idir_username || '';
    const isAdmin = checkAdminRole(session?.user);

    if (req.method === 'GET') {
      const excludeArchived = req.query.excludeArchived === 'true';
      const rosters = await getAllRealms(username, isAdmin, excludeArchived);
      res.send(rosters);
      return;
    } else if (req.method === 'POST') {
      let data = req.body;
      data.realm = kebabCase(data.realm);
      try {
        data = createRealmSchema.validateSync(data, { abortEarly: false, stripUnknown: true });
      } catch (e) {
        const error = e as ValidationError;
        return res.status(400).json({ success: false, error: error.errors });
      }

      const existingRealm = await prisma.roster.findMany({
        where: {
          realm: data.realm,
        },
      });

      const kcCore = new KeycloakCore('prod');

      const kcAdminClient = await kcCore.getAdminClient();

      const existingKcRealms = await kcAdminClient.realms.find();

      // the keycloak console may not show realm if the realm name was manually updated through console
      // however the realm id does not change
      if (existingRealm.length > 0 || existingKcRealms.find((realm) => realm.id === data.realm)) {
        return res.status(409).json({ success: false, error: 'Realm name already taken' });
      }

      let desiredMembers;
      try {
        desiredMembers = await resolveMembership(data);
      } catch (err) {
        if (err instanceof MemberValidationError) {
          return res.status(400).json({ success: false, error: [err.message] });
        }
        throw err;
      }

      let newRealm = await prisma.roster.create({
        data: {
          ...omit(data, ['productOwner', 'technicalLead', 'additionalUsers']),
          requestor: `${session.user.family_name}, ${session.user.given_name}`,
          preferredAdminLoginMethod: 'azureidir',
          environments: ['dev', 'test', 'prod'],
          lastUpdatedBy: `${session.user.family_name}, ${session.user.given_name}`,
          status: StatusEnum.PENDING,
        },
      });

      // The realm does not exist in Keycloak yet, so membership is stored unsynced and
      // provisioned by the reconcile that runs on approval.
      await applyMembershipChanges(newRealm.id, desiredMembers);
      const members = await getRealmMembers(newRealm.id);
      const membershipChanges = diffMembers([], members);

      await createEvent({
        realmId: newRealm.id,
        eventCode: EventEnum.REQUEST_CREATE_SUCCESS,
        idirUserId: username,
        details: { ...pick(newRealm, allowedFormFields), membershipChanges },
      });
      await sendCreateEmail(newRealm, session, members);
      return res.status(201).json({ ...newRealm, members: serializeMembers(members) });
    } else {
      return res.status(405).json({ success: false, error: 'Not allowed' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(422).json({ success: false, error: "Couldn't process request" });
  }
}
