import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { checkAdminRole, createEvent } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum } from 'validators/create-realm';
import { sendRestoreEmail } from 'utils/mailer';
import { addUserAsRealmAdmin, manageCustomRealm } from 'controllers/keycloak';
import { generateXML, makeSoapRequest, getBceidAccounts } from 'utils/idir';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { idir_requestor_user_guid } = serverRuntimeConfig;

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
        [realm?.productOwnerIdirUserId, realm?.technicalContactIdirUserId].forEach(async (idirUserId) => {
          const samlPayload = generateXML('userId', idirUserId as string, idir_requestor_user_guid);
          const { response }: any = await makeSoapRequest(samlPayload);
          const accounts = await getBceidAccounts(response);

          if (accounts.length > 0) {
            await addUserAsRealmAdmin(`${accounts[0].guid}@idir`, realm?.environments!, realm?.realm!);
          } else {
            console.error(`No guid found for user ${String(idirUserId)}`);
          }
        });
      }
    } catch (err) {
      console.error('failed to create realm admins', err);
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
