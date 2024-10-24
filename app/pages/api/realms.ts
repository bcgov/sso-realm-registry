import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { adminOnlyFields, allowedFormFields, checkAdminRole, createEvent } from 'utils/helpers';
import prisma from 'utils/prisma';
import KeycloakCore from 'utils/keycloak-core';
import { EventEnum, StatusEnum, createRealmSchema } from 'validators/create-realm';
import { ValidationError } from 'yup';
import omit from 'lodash.omit';
import pick from 'lodash.pick';
import kebabCase from 'lodash.kebabcase';
import { sendCreateEmail } from 'utils/mailer';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export const getAllRealms = async (username: string, isAdmin: boolean, excludeArchived: boolean = false) => {
  let rosters: any = null;
  let baseWhereClause: { archived?: boolean } = {};
  if (excludeArchived) baseWhereClause.archived = false;

  if (isAdmin) {
    rosters = await prisma.roster.findMany({ where: baseWhereClause, orderBy: { id: 'desc' } });
  } else {
    rosters = await prisma.roster.findMany({
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
  }

  const kcCore = new KeycloakCore('prod');

  if (rosters?.length > 0) {
    const kcAdminClient = await kcCore.getAdminClient();
    if (kcAdminClient) {
      for (let x = 0; x < rosters?.length; x++) {
        const realm = rosters[x];
        const [realmData] = await Promise.all([kcCore.getRealm(realm.realm)]);
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
        const distinctProviders = new Set(realmData?.identityProviders?.map((v) => v.providerId) || []);
        realm.protocol = Array.from(distinctProviders);
      }
    }
  }

  rosters = !isAdmin ? rosters.map((r: any) => omit(r, adminOnlyFields)) : rosters;
  return rosters;
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
