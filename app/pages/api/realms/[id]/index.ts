import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';
import { RoleEnum, adminOnlyFields, checkAdminRole, createEvent, getUpdatedProperties } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum, getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { ValidationError } from 'yup';
import { omit } from 'lodash';
import {
  sendAccessSyncFailedEmail,
  sendDeletionCompleteEmail,
  sendReadyToUseEmail,
  sendRealmAdminGrantedEmail,
  sendRealmAdminRevokedEmail,
  sendUpdateEmail,
} from 'utils/mailer';
import { manageCustomRealm, removeUserAsRealmAdmin } from 'controllers/keycloak';
import {
  RealmAccessSyncResult,
  getChangedManagedContacts,
  resolveIdirGuid,
  syncRealmAccess,
} from 'controllers/realm-access';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  let username: string;
  let currentRequest: any;
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    username = session?.user?.idir_username || '';
    const isAdmin = checkAdminRole(session?.user);
    if (req.method === 'GET') {
      let roster: any = null;

      const { id } = req.query;

      if (isAdmin) {
        roster = await prisma.roster.findUnique({
          where: {
            id: Number.parseInt(id as string, 10),
          },
        });
      } else {
        roster = await prisma.roster.findUnique({
          where: {
            id: Number.parseInt(id as string, 10),
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
      roster = !isAdmin ? omit(roster, adminOnlyFields) : roster;
      return res.send(roster);
    } else if (req.method === 'PUT') {
      let updateRequest = req.body;
      let updaterRole = '';
      let isPO = false;
      let updatedRealm: any;
      let updatingApprovalStatus = false;
      let allEnvRealmsCreated = false;
      let syncResult: RealmAccessSyncResult | null = null;

      const realmId = Number.parseInt(req.query.id as string, 10);

      try {
        let lastUpdatedBy = `${session.user.family_name}, ${session.user.given_name}`;

        updateRequest.ministry =
          updateRequest.ministry === 'Other' ? updateRequest.ministryOther : updateRequest.ministry;
        updateRequest.division =
          updateRequest.division === 'Other' ? updateRequest.divisionOther : updateRequest.division;
        updateRequest.branch = updateRequest.branch === 'Other' ? updateRequest.branchOther : updateRequest.branch;

        currentRequest = await prisma.roster.findUnique({
          where: {
            id: Number.parseInt(req.query.id as string, 10),
          },
        });

        if (!currentRequest || currentRequest.approved === false) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        isPO = username.toLowerCase() === currentRequest.productOwnerIdirUserId?.toLowerCase();
        const isTechnicalContact = [
          currentRequest.technicalContactIdirUserId.toLowerCase(),
          currentRequest.secondTechnicalContactIdirUserId.toLowerCase(),
        ].includes(username.toLowerCase());

        if (!isAdmin && !isPO && !isTechnicalContact)
          return res.status(401).json({ success: false, error: 'unauthorized' });

        updaterRole = isAdmin ? RoleEnum.ADMIN : isPO ? RoleEnum.PRODUCT_OWNER : RoleEnum.TECHNICAL_LEAD;

        try {
          updateRequest = getUpdateRealmSchemaByRole(updaterRole).validateSync(updateRequest, {
            abortEarly: false,
            stripUnknown: true,
          });
        } catch (e) {
          const error = e as ValidationError;
          return res.status(400).json({ success: false, error: error.errors });
        }

        // A change to a managed contact's IDIR user id is the trigger for an access sync. Email is
        // metadata that can change for the same person, so an email-only edit never touches keycloak.
        const changedContacts =
          currentRequest.approved && currentRequest.status === StatusEnum.APPLIED
            ? getChangedManagedContacts(currentRequest, updateRequest)
            : [];
        const outgoingGuids: { [field: string]: string | null } = {};
        const guidBackfill: { [field: string]: string } = {};

        for (const contact of changedContacts) {
          // Accepting an incoming contact that MS Graph cannot resolve creates a state no retry
          // can ever converge, so reject the edit before writing anything.
          const incomingGuid = await resolveIdirGuid(updateRequest[contact.idirField]);
          if (!incomingGuid) {
            return res.status(400).json({
              success: false,
              error: `No IDIR account found for the ${contact.label} ${updateRequest[contact.idirField]}`,
            });
          }
        }

        for (const contact of changedContacts) {
          // On legacy rows the guid column is null, and the DB write is about to replace the
          // outgoing contact's IDIR user id. Resolve and persist it in the same write so the row
          // still reads as "granted = outgoing, want = incoming" once the sync runs.
          const storedGuid = currentRequest[contact.guidField];
          if (storedGuid) {
            outgoingGuids[contact.guidField] = storedGuid.toLowerCase();
            continue;
          }

          const outgoingGuid = await resolveIdirGuid(currentRequest[contact.idirField]);
          outgoingGuids[contact.guidField] = outgoingGuid;

          if (outgoingGuid) {
            guidBackfill[contact.guidField] = outgoingGuid;
          } else {
            // The outgoing contact has no Entra account, so they can no longer log in and there
            // is nothing to revoke.
            await createEvent({
              realmId,
              eventCode: EventEnum.REQUEST_ACCESS_REVOKE_SKIPPED,
              idirUserId: username,
              details: { field: contact.idirField, idirUserId: currentRequest[contact.idirField] },
            });
          }
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
              realmId: Number.parseInt(req.query.id as string, 10),
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
              realmId: Number.parseInt(req.query.id as string, 10),
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
              realmId: Number.parseInt(req.query.id as string, 10),
              eventCode: EventEnum.REQUEST_REJECT_SUCCESS,
              idirUserId: username,
              details: req.body,
            });
            updateRequest.approved = false;
          }

          if (currentRequest.status !== StatusEnum.PENDING) {
            updateRequest = omit(updateRequest, ['approved']);
          }

          updatedRealm = await prisma.roster.update({
            where: {
              id: realmId,
            },
            data: {
              ...updateRequest,
              ...guidBackfill,
              lastUpdatedBy,
            },
          });
        } else {
          updatedRealm = await prisma.roster.update({
            where: {
              id: realmId,
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
            data: {
              ...updateRequest,
              ...guidBackfill,
              lastUpdatedBy,
            },
          });
        }

        await createEvent({
          realmId,
          eventCode: EventEnum.REQUEST_UPDATE_SUCCESS,
          idirUserId: username,
          details: getUpdatedProperties(currentRequest, updatedRealm),
        });

        // Keycloak access is reconciled from the row that was just written, so the sync runs after
        // the DB write and the outcome emails run after the sync.
        if (changedContacts.length > 0 || (updatingApprovalStatus && allEnvRealmsCreated)) {
          syncResult = await syncRealmAccess(realmId, username);
        }

        if (syncResult && !syncResult.success) {
          // Telling a new contact they have access when the grant failed is worse than silence, so
          // only the SSO team hears about it.
          await sendAccessSyncFailedEmail(updatedRealm, syncResult);
        } else if (syncResult) {
          for (const contact of changedContacts) {
            await sendRealmAdminGrantedEmail(updatedRealm, updatedRealm[contact.emailField], contact.label);

            const outgoingGuid = outgoingGuids[contact.guidField];
            if (outgoingGuid && syncResult.revoked.includes(outgoingGuid)) {
              await sendRealmAdminRevokedEmail(updatedRealm, currentRequest[contact.emailField], contact.label);
            }
          }
        }

        // emails
        await sendUpdateEmail(updatedRealm, session, updatingApprovalStatus);
        if (isAdmin && updatingApprovalStatus && updatedRealm.approved && allEnvRealmsCreated)
          await sendReadyToUseEmail(currentRequest);

        // The edit itself succeeded even when keycloak lags, so the sync outcome is reported as a
        // field on a 200 rather than as an error status.
        const responseRealm = isAdmin ? updatedRealm : omit(updatedRealm, adminOnlyFields);
        return res.send({
          ...responseRealm,
          accessSyncFailedAt: syncResult
            ? syncResult.success
              ? null
              : new Date()
            : (updatedRealm.accessSyncFailedAt ?? null),
        });
      } catch (err) {
        await createEvent({
          realmId: Number.parseInt(req.query.id as string, 10),
          eventCode: EventEnum.REQUEST_UPDATE_FAILED,
          idirUserId: username,
          details: getUpdatedProperties(currentRequest, updatedRealm),
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
            id: Number.parseInt(id as string, 10),
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
            id: Number.parseInt(id as string, 10),
          },
        });

        await createEvent({
          realmId: Number.parseInt(req.query.id as string, 10),
          eventCode: allEnvRealmsDeleted ? EventEnum.REQUEST_DELETE_SUCCESS : EventEnum.REQUEST_DELETE_FAILED,
          idirUserId: username,
          details: req.body,
        });

        if (!allEnvRealmsDeleted) {
          return res.status(422).send('Unable to process the delete request at this time');
        }

        await removeUserAsRealmAdmin(
          [realm.productOwnerGuid, realm.technicalContactGuid],
          realm.environments,
          realm.realm as string,
        );

        await sendDeletionCompleteEmail(realm);
        return res.status(200).send('Success');
      } catch (err) {
        console.error(err);
        await createEvent({
          realmId: Number.parseInt(req.query.id as string, 10),
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
