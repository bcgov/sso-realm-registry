import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from 'utils/prisma';
import { DeletedUserRealm, sendDeletedUserEmail } from 'utils/mailer';
import { getRealmMembers, leadEmails, memberRoleLabels } from 'controllers/user-access';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string | any;

/**
 * Webhook for an IDIR account that no longer exists. Notification only: it deliberately
 * does not revoke, because a spurious call must not be able to strip a realm's only
 * product owner. Joining through `users_rosters` also catches additional users, which
 * the old three column lookup never could.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const { Authorization, authorization } = req.headers || {};
    const authHeader = Authorization || authorization;
    if (!authHeader || authHeader !== process.env.API_AUTH_SECRET) {
      return res.status(401).json({ success: false, message: 'not authorized' });
    }
    const { id } = req.query;

    if (!(typeof id === 'string')) return res.status(400).send('invalid parameters');

    if (req.method === 'DELETE') {
      const memberships = await prisma.userRoster.findMany({
        where: {
          removedAt: null,
          user: { idirUsername: { equals: id, mode: 'insensitive' } },
          roster: {
            archived: false,
            status: 'applied',
            approved: true,
          },
        },
        include: { roster: true },
        orderBy: { rosterId: 'asc' },
      });

      if (memberships.length === 0) return res.status(200).send('OK');

      const rosterIds = Array.from(new Set(memberships.map((membership) => membership.rosterId)));
      const affectedRealms: DeletedUserRealm[] = [];

      for (const rosterId of rosterIds) {
        const held = memberships.filter((membership) => membership.rosterId === rosterId);
        const members = await getRealmMembers(rosterId);

        // Do not write to the departed user; they no longer have an account.
        const recipients = leadEmails(
          members.filter((member) => member.user.idirUsername.toLowerCase() !== id.toLowerCase()),
        );

        affectedRealms.push({
          realm: held[0].roster.realm as string,
          roles: held.map((membership) => memberRoleLabels[membership.role] ?? membership.role),
          recipients,
        });
      }

      await sendDeletedUserEmail(affectedRealms, id);
      res.status(200).send('OK');
    } else {
      res.status(405).send('method not allowed');
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false });
  }
}
