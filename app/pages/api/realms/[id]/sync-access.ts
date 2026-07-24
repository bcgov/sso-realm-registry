import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { checkAdminRole } from 'utils/helpers';
import prisma from 'utils/prisma';
import { sendAccessSyncFailedEmail } from 'utils/mailer';
import { syncRealmAccess } from 'controllers/realm-access';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | object;

/**
 * Manual retry for a realm whose admin access did not converge. Works purely from database state:
 * the gap between the desired contacts and the guids access was last granted to is the work.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!checkAdminRole(session?.user)) return res.status(403).json({ success: false, error: 'forbidden' });

    const realmId = parseInt(req.query.id as string, 10);
    if (Number.isNaN(realmId)) return res.status(400).json({ success: false, error: 'Invalid request' });

    const realm = await prisma.roster.findUnique({ where: { id: realmId } });
    if (!realm) return res.status(404).json({ success: false, error: 'Not found' });

    const result = await syncRealmAccess(realmId, session?.user?.idir_username || '');

    if (!result.success) await sendAccessSyncFailedEmail(realm, result);

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
