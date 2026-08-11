import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { RoleEnum, adminOnlyFields, checkAdminRole, createEvent, getUpdatedProperties } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum, getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { ValidationError } from 'yup';
import { omit } from 'lodash';
import {
  offboardRealmAdmin,
  onboardNewRealmAdmin,
  sendAccessSyncFailureEmail,
  sendDeletionCompleteEmail,
  sendReadyToUseEmail,
  sendUpdateEmail,
} from 'utils/mailer';
import { manageCustomRealm } from 'controllers/keycloak';
import {
  MemberRoleEnum,
  MemberValidationError,
  applyMembershipChanges,
  canEditRealm,
  diffMembers,
  getRealmMembers,
  getUserRoleOnRealm,
  reconcileRealmAccess,
  resolveMembership,
  revokeAllRealmAccess,
  serializeRoster,
} from 'controllers/user-access';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

const membershipFields = ['productOwner', 'technicalLead', 'additionalUsers'];

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  let username: string;
  let currentRequest: any;
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    username = session?.user?.idir_username || '';
    const isAdmin = checkAdminRole(session?.user);
    const realmId = Number.parseInt(req.query.id as string, 10);

    if (req.method === 'GET') {
      const roster = await prisma.roster.findUnique({ where: { id: realmId } });
      if (!roster) return res.send(null as any);

      // Additional users may view the realm they hold access to, but not edit it.
      const memberRole = isAdmin ? null : await getUserRoleOnRealm(realmId, username);
      if (!isAdmin && !memberRole) return res.send(null as any);

      const members = await getRealmMembers(realmId);
      const payload = serializeRoster(roster, members);
      return res.send((isAdmin ? payload : omit(payload, adminOnlyFields)) as any);
    } else if (req.method === 'PUT') {
      let updateRequest = req.body;
      let updaterRole = '';
      let updatedRealm: any;
      let updatingApprovalStatus = false;
      let allEnvRealmsCreated = false;
      let membershipChanges: ReturnType<typeof diffMembers> | undefined;

      try {
        let lastUpdatedBy = `${session.user.family_name}, ${session.user.given_name}`;

        updateRequest.ministry =
          updateRequest.ministry === 'Other' ? updateRequest.ministryOther : updateRequest.ministry;
        updateRequest.division =
          updateRequest.division === 'Other' ? updateRequest.divisionOther : updateRequest.division;
        updateRequest.branch = updateRequest.branch === 'Other' ? updateRequest.branchOther : updateRequest.branch;

        currentRequest = await prisma.roster.findUnique({
          where: {
            id: realmId,
          },
        });

        if (!currentRequest || currentRequest.approved === false) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const previousMembers = await getRealmMembers(realmId);

        const memberRole = await getUserRoleOnRealm(realmId, username);
        if (!canEditRealm(memberRole, isAdmin)) return res.status(401).json({ success: false, error: 'unauthorized' });

        // Product owner and technical lead are symmetric on membership; they differ only
        // on the product fields, which is why there are still three schema branches.
        updaterRole = isAdmin
          ? RoleEnum.ADMIN
          : memberRole === MemberRoleEnum.PRODUCT_OWNER
          ? RoleEnum.PRODUCT_OWNER
          : RoleEnum.TECHNICAL_LEAD;

        try {
          updateRequest = getUpdateRealmSchemaByRole(updaterRole).validateSync(updateRequest, {
            abortEarly: false,
            stripUnknown: true,
          });
        } catch (e) {
          const error = e as ValidationError;
          return res.status(400).json({ success: false, error: error.errors });
        }

        let desiredMembers;
        try {
          desiredMembers = await resolveMembership(updateRequest, realmId);
        } catch (err) {
          if (err instanceof MemberValidationError) {
            return res.status(400).json({ success: false, error: [err.message] });
          }
          throw err;
        }

        if (isAdmin) {
          // when request is pending and gets approved
          if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'true' &&
            currentRequest.approved === null
          ) {
            updatingApprovalStatus = true;
            await createEvent({
              realmId,
              eventCode: EventEnum.REQUEST_APPROVE_SUCCESS,
              idirUserId: username,
              details: req.body,
            });

            try {
              await manageCustomRealm(currentRequest?.realm, currentRequest.environments, 'create');
              allEnvRealmsCreated = true;
            } catch (err) {
              console.error('Error creating custom realm', err);
            }

            await createEvent({
              realmId,
              eventCode: allEnvRealmsCreated ? EventEnum.REQUEST_APPLY_SUCCESS : EventEnum.REQUEST_APPLY_FAILED,
              idirUserId: username,
              details: req.body,
            });

            updateRequest.approved = true;
            updateRequest.status = allEnvRealmsCreated ? StatusEnum.APPLIED : StatusEnum.APPLYFAILED;

            // when request is pending and gets rejected
          } else if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'false' &&
            !currentRequest.prNumber
          ) {
            updatingApprovalStatus = true;
            await createEvent({
              realmId,
              eventCode: EventEnum.REQUEST_REJECT_SUCCESS,
              idirUserId: username,
              details: req.body,
            });
            updateRequest.approved = false;
          }

          if (currentRequest.status !== StatusEnum.PENDING) {
            updateRequest = omit(updateRequest, ['approved']);
          }
        }

        updatedRealm = await prisma.roster.update({
          where: {
            id: realmId,
          },
          data: {
            ...omit(updateRequest, membershipFields),
            lastUpdatedBy,
          },
        });

        // The database transaction commits regardless of the Keycloak outcome; failures
        // leave synced_at / revoked_at null, which is what the sync button picks up.
        const { changedIds } = await applyMembershipChanges(realmId, desiredMembers);

        // A save typically touches one or two members, so awaiting it is cheap. Approval
        // is the one path that reconciles everybody.
        const reconciledAll = updatingApprovalStatus && updateRequest.approved === true && allEnvRealmsCreated;
        const reconcile = await reconcileRealmAccess(updatedRealm, reconciledAll ? {} : { memberIds: changedIds });

        const members = await getRealmMembers(realmId);
        membershipChanges = diffMembers(previousMembers, members);

        await createEvent({
          realmId,
          eventCode: EventEnum.REQUEST_UPDATE_SUCCESS,
          idirUserId: username,
          details: { ...getUpdatedProperties(currentRequest, updatedRealm), membershipChanges },
        });

        // Confirmations only go out once access actually changed everywhere, so nobody is
        // told they have access that was never provisioned. Approval has its own email.
        if (!updatingApprovalStatus) {
          for (const member of reconcile.added) {
            await onboardNewRealmAdmin(session, updatedRealm, member, members);
          }
          for (const member of reconcile.removed) {
            await offboardRealmAdmin(session, updatedRealm, member, members);
          }
        }

        // One summary per attempt, so an environment outage cannot flood the inbox.
        await sendAccessSyncFailureEmail(updatedRealm, reconcile.failures);

        await sendUpdateEmail(updatedRealm, session, updatingApprovalStatus, members);
        if (isAdmin && updatingApprovalStatus && updatedRealm.approved && allEnvRealmsCreated)
          await sendReadyToUseEmail(updatedRealm, members);

        const payload = serializeRoster(updatedRealm, members);
        return res.send((isAdmin ? payload : omit(payload, adminOnlyFields)) as any);
      } catch (err) {
        await createEvent({
          realmId,
          eventCode: EventEnum.REQUEST_UPDATE_FAILED,
          idirUserId: username,
          details: { ...getUpdatedProperties(currentRequest, updatedRealm), membershipChanges },
        });
        console.error(err);
        return res.status(500).json({ success: false, error: 'update failed' });
      }
    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).send('Invalid request');
      if (!isAdmin) return res.status(401).send('Unauthorized');

      let allEnvRealmsDeleted = false;

      try {
        const realm = await prisma.roster.findUnique({
          where: {
            id: realmId,
            archived: false,
          },
        });

        if (!realm) return res.status(404).send('Not found');

        try {
          await manageCustomRealm(realm.realm as string, realm.environments, 'delete');
          allEnvRealmsDeleted = true;
        } catch (err) {
          console.error('Error deleting custom realm', err);
        }

        await prisma.roster.update({
          data: {
            archived: true,
            status: allEnvRealmsDeleted ? StatusEnum.APPLIED : StatusEnum.APPLYFAILED,
          },
          where: {
            id: realmId,
          },
        });

        await createEvent({
          realmId,
          eventCode: allEnvRealmsDeleted ? EventEnum.REQUEST_DELETE_SUCCESS : EventEnum.REQUEST_DELETE_FAILED,
          idirUserId: username,
          details: req.body,
        });

        if (!allEnvRealmsDeleted) {
          return res.status(422).send('Unable to process the delete request at this time');
        }

        const members = await getRealmMembers(realmId);
        // Membership survives the archive so a restore can re-provision it.
        const failures = await revokeAllRealmAccess(realm);
        await sendAccessSyncFailureEmail(realm, failures);

        await sendDeletionCompleteEmail(realm, members);
        return res.status(200).send('Success');
      } catch (err) {
        console.error(err);
        await createEvent({
          realmId,
          eventCode: EventEnum.REQUEST_DELETE_FAILED,
          idirUserId: username,
          details: req.body,
        });
        throw new Error(`Failed to delete realm with id ${id}`);
      }
    } else {
      return res.status(405).json({ success: false, error: 'Not allowed' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
