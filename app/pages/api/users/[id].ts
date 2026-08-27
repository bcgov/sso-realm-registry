import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from 'utils/prisma';
import { DeletedUserRealm, sendAccessSyncFailureEmail, sendDeletedUserEmail } from 'utils/mailer';
import {
  getRealmMembers,
  isRealmProvisioned,
  leadEmails,
  memberRoleLabels,
  reconcileRealmAccess,
  tombstoneMemberships,
} from 'controllers/user-access';
import { MemberRoleEnum } from 'utils/constants';
import { createEvent } from 'utils/helpers';
import { EventEnum } from 'validators/create-realm';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string | any;

/** Webhook for an IDIR account that no longer exists. */
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
      const user = await prisma.user.findFirst({
        where: { guid: { equals: id, mode: 'insensitive' } },
        include: {
          rosters: {
            where: {
              removedAt: null,
            },
            include: { roster: true },
            orderBy: { rosterId: 'asc' },
          },
        },
      });

      if (!user) return res.status(200).send('OK');

      // The join to rosters includes the users_rosters record for all realms, with the users role
      // Only realms actually provisioned in Keycloak should trigger revocation, notifications, and audit events.
      const userRealmMemberships = user.rosters.filter((membership) => isRealmProvisioned(membership.roster));
      if (userRealmMemberships.length === 0) return res.status(200).send('OK');

      const rosterIds = Array.from(new Set(userRealmMemberships.map((membership) => membership.rosterId)));
      const affectedRealms: DeletedUserRealm[] = [];

      for (const rosterId of rosterIds) {
        const userMembershipsOnCurrentRealm = userRealmMemberships.filter(
          (membership) => membership.rosterId === rosterId,
        );
        const members = await getRealmMembers(rosterId);
        const otherRealmMembers = members.filter(
          (member) => member.user.idirUsername.toLowerCase() !== user.idirUsername.toLowerCase(),
        );

        affectedRealms.push({
          realm: userMembershipsOnCurrentRealm[0].roster.realm as string,
          roles: userMembershipsOnCurrentRealm.map(
            (membership) => memberRoleLabels[membership.role] ?? membership.role,
          ),
          recipients: leadEmails(otherRealmMembers),
          actionRequired: !otherRealmMembers.some(
            (member) => member.role === MemberRoleEnum.PRODUCT_OWNER || member.role === MemberRoleEnum.TECHNICAL_LEAD,
          ),
        });
      }

      const tombstonedIds = await tombstoneMemberships(userRealmMemberships.map((membership) => membership.id));

      for (const rosterId of rosterIds) {
        const userMembershipsOnCurrentRealm = userRealmMemberships.filter(
          (membership) => membership.rosterId === rosterId,
        );
        const realm = userMembershipsOnCurrentRealm[0].roster;
        const tombstonedMembershipsOnCurrentRealm = userMembershipsOnCurrentRealm
          .map((membership) => membership.id)
          .filter((membershipId) => tombstonedIds.includes(membershipId));
        const reconcile = await reconcileRealmAccess(realm, { memberIds: tombstonedMembershipsOnCurrentRealm });

        await sendAccessSyncFailureEmail(realm, reconcile.failures);
        await createEvent({
          realmId: rosterId,
          eventCode: EventEnum.REQUEST_UPDATE_SUCCESS,
          idirUserId: user.idirUsername,
          details: {
            automated: true,
            reason: 'inactive-idir',
            membershipChanges: {
              added: [],
              removed: userMembershipsOnCurrentRealm.map((membership) => ({
                role: membership.role,
                idirUsername: user.idirUsername,
              })),
            },
          },
        });
      }

      await sendDeletedUserEmail(affectedRealms, id);
      return res.status(200).send('OK');
    } else {
      return res.status(405).send('method not allowed');
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}
