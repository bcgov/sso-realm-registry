import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { checkAdminRole } from 'utils/helpers';
import prisma from 'utils/prisma';
import { sendAccessSyncFailureEmail } from 'utils/mailer';
import { reconcileRealmAccess } from 'controllers/user-access';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | { success: true; synced: number; revoked: number; failures: number };

/**
 * Manual retry for realm access that failed to sync. Reconciles every pending row on the
 * realm, in every environment. Every operation is idempotent, so re-running an
 * environment that already succeeded is harmless.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });
    if (!checkAdminRole(session?.user)) return res.status(403).json({ success: false, error: 'forbidden' });

    const realmId = Number.parseInt(req.query.id as string, 10);
    const realm = await prisma.roster.findUnique({ where: { id: realmId } });
    if (!realm) return res.status(404).json({ success: false, error: 'Not found' });

    const reconcile = await reconcileRealmAccess(realm);
    if (!reconcile.provisioned) {
      return res.status(400).json({ success: false, error: 'Realm has not been provisioned yet' });
    }

    await sendAccessSyncFailureEmail(realm, reconcile.failures);

    if (reconcile.failures.length > 0) {
      return res.status(422).json({ success: false, error: reconcile.failures });
    }

    return res.status(200).json({
      success: true,
      synced: reconcile.added.length,
      revoked: reconcile.removed.length,
      failures: 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Unexpected Exception' });
  }
}
