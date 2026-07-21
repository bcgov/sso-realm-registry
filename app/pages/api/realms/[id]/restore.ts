import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { checkAdminRole, createEvent } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum } from 'validators/create-realm';
import { sendRestoreEmail, sendKeycloakErrorEmail } from 'utils/mailer';
import { addUserAsRealmAdmin, manageCustomRealm } from 'controllers/keycloak';
import { fetchIdirUser } from 'controllers/msal';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    if (req.method !== 'POST') res.status(405).json({ success: false, error: 'Method Not Allowed' });

    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    const username = session?.user?.idir_username || '';
    const isAdmin = checkAdminRole(session?.user);
    if (!isAdmin) {
      return res.status(403).send({ success: false, error: 'forbidden' });
    }
    let allEnvRealmsRestored = false;
    const lastUpdatedBy = `${session.user.family_name}, ${session.user.given_name}`;
    const realm = await prisma.roster.findUnique({
      where: {
        id: parseInt(req.query.id as string, 10),
      },
    });

    if (!realm) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    const canRestore = ([StatusEnum.APPLIED] as string[]).includes(realm.status!) && realm.archived === true;
    if (!canRestore) return res.status(400).json({ success: false, error: 'Invalid request' });

    try {
      await manageCustomRealm(realm.realm!, realm.environments!, 'restore');
      allEnvRealmsRestored = true;
    } catch (err) {
      console.error('Error restoring custom realm', err);
    }

    await prisma.roster.update({
      where: {
        id: parseInt(req.query.id as string, 10),
      },
      data: {
        lastUpdatedBy,
        archived: false,
        status: allEnvRealmsRestored ? StatusEnum.APPLIED : StatusEnum.APPLYFAILED,
      },
    });

    await createEvent({
      realmId: parseInt(req.query.id as string, 10),
      eventCode: allEnvRealmsRestored ? EventEnum.REQUEST_RESTORE_SUCCESS : EventEnum.REQUEST_RESTORE_FAILED,
      idirUserId: username,
    });

    if (!allEnvRealmsRestored) {
      return res.status(422).send('Unable to process the restore request at this time');
    }

    try {
      if (allEnvRealmsRestored) {
        for (const idirUserId of [realm?.productOwnerIdirUserId, realm?.technicalContactIdirUserId]) {
          if (!idirUserId) {
            const msg = `Missing IDIR user ID on realm ${realm?.realm} during restore`;
            console.error(msg);
            await sendKeycloakErrorEmail(realm?.realm!, `add realm admin on restore`, msg);
            continue;
          }
          const user = await fetchIdirUser({ userId: idirUserId });
          if (user && user.guid) {
            await addUserAsRealmAdmin(`${user.guid.toLowerCase()}@azureidir`, realm?.environments!, realm?.realm!);
          } else {
            const msg = `No GUID found for user ${idirUserId} during restore`;
            console.error(msg);
            await sendKeycloakErrorEmail(realm?.realm!, `add realm admin for ${idirUserId} on restore`, msg);
          }
        }
      }
    } catch (err) {
      console.error('failed to create realm admins on restore', err);
      await sendKeycloakErrorEmail(realm?.realm!, 'add realm admins on restore', err);
    }

    //emails
    await sendRestoreEmail(realm, `${session.user.given_name} ${session.user.family_name}`);

    res.status(200).send('success');
  } catch (err: any) {
    console.error(err);
    await createEvent({
      realmId: parseInt(req.query.id as string, 10),
      eventCode: EventEnum.REQUEST_RESTORE_FAILED,
    });
    return res.status(500).json({ success: false, error: 'Unexpected Exception' });
  }
}
