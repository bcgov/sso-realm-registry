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
import { Roster } from '@prisma/client';

type EnvironmentRealmData = {
  dev: RealmRepresentation[];
  test: RealmRepresentation[];
  prod: RealmRepresentation[];
};

type OutOfSyncDetails = { dev: string; test: string; prod: string };

/**
 * Adds an outOfSync and outOfSync details section to rosters indicating their sync status with keycloak
 */
const checkRosterSync = (rosters: Roster[], realms: EnvironmentRealmData) => {
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
  let baseWhereClause: { archived?: boolean } = {};
  if (excludeArchived) baseWhereClause.archived = false;

  if (isAdmin) {
    const rosters = await prisma.roster.findMany({ where: baseWhereClause, orderBy: { id: 'desc' } });
    let realms: EnvironmentRealmData = { dev: [], test: [], prod: [] };
    for (const env of ['dev', 'test', 'prod']) {
      const kcClient = await new KeycloakCore(env);
      await kcClient.getAdminClient();
      realms[env as keyof EnvironmentRealmData] = await kcClient.getRealms();
    }
    const rostersWithSyncData = checkRosterSync(rosters, realms);
    return rostersWithSyncData;
  } else {
    const rosters = await prisma.roster.findMany({
      orderBy: { id: 'desc' },
      where: {
        ...baseWhereClause,
        OR: [
          {
            technicalContactIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
          {
            secondTechnicalContactIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
          {
            productOwnerIdirUserId: {
              equals: username,
              mode: 'insensitive',
            },
          },
        ],
      },
    });
    return rosters.map((r: any) => omit(r, adminOnlyFields));
  }
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

      let newRealm = await prisma.roster.create({
        data: {
          ...data,
          requestor: `${session.user.family_name}, ${session.user.given_name}`,
          preferredAdminLoginMethod: 'idir',
          environments: ['dev', 'test', 'prod'],
          lastUpdatedBy: `${session.user.family_name}, ${session.user.given_name}`,
          status: StatusEnum.PENDING,
        },
      });
      await createEvent({
        realmId: newRealm.id,
        eventCode: EventEnum.REQUEST_CREATE_SUCCESS,
        idirUserId: username,
        details: pick(newRealm, allowedFormFields),
      });
      await sendCreateEmail(newRealm, session);
      return res.status(201).json(newRealm);
    } else {
      return res.status(405).json({ success: false, error: 'Not allowed' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(422).json({ success: false, error: "Couldn't process request" });
  }
}
