import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from 'utils/prisma';
import { MemberRoleEnum } from 'utils/constants';
import { isUserCleanupFeatureEnabled } from 'utils/feature-flags';

interface CleanupRealm {
  name: string | null;
  userTypes: string[];
  idpAliases: { idir: string | null; azureidir: string | null };
  notifyOnDeletion: boolean;
  notifications: string[];
}

interface CleanupResponse {
  realms: CleanupRealm[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CleanupResponse | { error: string }>) {
  const { Authorization, authorization } = req.headers || {};
  const authHeader = Authorization || authorization;
  if (!authHeader || authHeader !== process.env.API_AUTH_SECRET) {
    return res.status(401).json({ error: 'not authorized' });
  }

  if (!isUserCleanupFeatureEnabled()) return res.status(404).json({ error: 'not found' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    const rosters = await prisma.roster.findMany({
      where: {
        userCleanupEnabled: true,
        approved: true,
        archived: false,
        realm: { not: null },
      },
      select: {
        realm: true,
        userCleanupTypes: true,
        userCleanupIdirAlias: true,
        userCleanupAzureidirAlias: true,
        userCleanupNotifications: true,
        members: {
          where: {
            removedAt: null,
            role: { in: [MemberRoleEnum.PRODUCT_OWNER, MemberRoleEnum.TECHNICAL_LEAD] },
          },
          select: {
            user: { select: { email: true } },
          },
        },
      },
    });

    return res.status(200).json({
      realms: rosters.map((roster) => ({
        name: roster.realm,
        userTypes: roster.userCleanupTypes,
        idpAliases: {
          idir: roster.userCleanupIdirAlias,
          azureidir: roster.userCleanupAzureidirAlias,
        },
        notifyOnDeletion: roster.userCleanupNotifications,
        notifications: roster.userCleanupNotifications
          ? Array.from(
              new Set(roster.members.map(({ user }) => user.email).filter((email): email is string => !!email)),
            )
          : [],
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
