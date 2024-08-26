import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { RoleEnum, adminOnlyFields, checkAdminRole, createEvent, getUpdatedProperties } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum, getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { ValidationError } from 'yup';
import omit from 'lodash.omit';
import {
  offboardRealmAdmin,
  onboardNewRealmAdmin,
  sendDeleteEmail,
  sendDeletionCompleteEmail,
  sendReadyToUseEmail,
  sendUpdateEmail,
} from 'utils/mailer';
import {
  addUserAsRealmAdmin,
  createCustomRealm,
  deleteCustomRealm,
  disableCustomRealm,
  removeUserAsRealmAdmin,
} from 'controllers/keycloak';
import { generateXML, makeSoapRequest, getBceidAccounts } from 'utils/idir';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { idir_requestor_user_guid, app_env } = serverRuntimeConfig;

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
            id: parseInt(id as string, 10),
          },
        });
      } else {
        roster = await prisma.roster.findUnique({
          where: {
            id: parseInt(id as string, 10),
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

      const omitFieldsBeforeApplied = [
        'productOwnerEmail',
        'productOwnerIdirUserId',
        'technicalContactIdirUserId',
        'technicalContactEmail',
        'secondTechnicalContactEmail',
        'secondTechnicalContactIdirUserId',
      ];

      try {
        let lastUpdatedBy = `${session.user.family_name}, ${session.user.given_name}`;

        updateRequest.ministry =
          updateRequest.ministry === 'Other' ? updateRequest.ministryOther : updateRequest.ministry;
        updateRequest.division =
          updateRequest.division === 'Other' ? updateRequest.divisionOther : updateRequest.division;
        updateRequest.branch = updateRequest.branch === 'Other' ? updateRequest.branchOther : updateRequest.branch;

        currentRequest = await prisma.roster.findUnique({
          where: {
            id: parseInt(req.query.id as string, 10),
          },
        });

        if (!currentRequest || currentRequest.approved === false) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        isPO = username.toLowerCase() === currentRequest.productOwnerIdirUserId?.toLowerCase();

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

        if (isAdmin) {
          // when request is pending and gets approved
          if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'true' &&
            currentRequest.approved === null
          ) {
            updatingApprovalStatus = true;
            await createEvent({
              realmId: parseInt(req.query.id as string, 10),
              eventCode: EventEnum.REQUEST_APPROVE_SUCCESS,
              idirUserId: username,
              details: req.body,
            });

            await prisma.roster.update({
              data: {
                status: StatusEnum.PLANNED,
              },
              where: {
                id: parseInt(currentRequest.id as string, 10),
              },
            });

            let allEnvRealmsCreated = true;

            try {
              for (const env of currentRequest?.environments) {
                const created = await createCustomRealm(currentRequest?.realm!, env);
                if (!created) allEnvRealmsCreated = false;
              }
            } catch (err) {
              console.error('error creating custom realm', err);
              allEnvRealmsCreated = false;
            }

            await createEvent({
              realmId: parseInt(req.query.id as string, 10),
              eventCode: allEnvRealmsCreated ? EventEnum.REQUEST_APPLY_SUCCESS : EventEnum.REQUEST_APPLY_FAILED,
              idirUserId: username,
              details: req.body,
            });

            updateRequest.approved = true;
            updateRequest.status = allEnvRealmsCreated ? StatusEnum.APPLIED : StatusEnum.APPLYFAILED;

            try {
              if (allEnvRealmsCreated) {
                [currentRequest?.productOwnerIdirUserId, currentRequest?.technicalContactIdirUserId].forEach(
                  async (idirUserId) => {
                    const samlPayload = generateXML('userId', idirUserId as string, idir_requestor_user_guid);
                    const { response }: any = await makeSoapRequest(samlPayload);
                    const accounts = await getBceidAccounts(response);

                    if (accounts.length > 0) {
                      await addUserAsRealmAdmin(
                        `${accounts[0].guid}@idir`,
                        currentRequest?.environments!,
                        currentRequest?.realm!,
                      );
                    } else {
                      console.error(`No guid found for user ${String(idirUserId)}`);
                    }
                  },
                );
              }
            } catch (err) {
              console.error('failed to create realm admins', err);
            }

            // when request is pending and gets rejected
          } else if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'false' &&
            !currentRequest.prNumber
          ) {
            updatingApprovalStatus = true;
            await createEvent({
              realmId: parseInt(req.query.id as string, 10),
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
              id: parseInt(req.query.id as string, 10),
            },
            data: {
              ...updateRequest,
              lastUpdatedBy,
            },
          });
        } else {
          updatedRealm = await prisma.roster.update({
            where: {
              id: parseInt(req.query.id as string, 10),
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
              lastUpdatedBy,
            },
          });
        }

        await createEvent({
          realmId: parseInt(req.query.id as string, 10),
          eventCode: EventEnum.REQUEST_UPDATE_SUCCESS,
          idirUserId: username,
          details: getUpdatedProperties(currentRequest, updatedRealm),
        });
        updatedRealm = !isAdmin ? omit(updatedRealm, adminOnlyFields) : updatedRealm;

        let typeOfContactUpdate = '';

        if (
          currentRequest.approved &&
          currentRequest.status === StatusEnum.APPLIED &&
          currentRequest.productOwnerEmail !== updateRequest.productOwnerEmail
        ) {
          typeOfContactUpdate = 'Product Owner';
          await onboardNewRealmAdmin(
            session,
            updatedRealm,
            currentRequest.productOwnerEmail!,
            updatedRealm.productOwnerEmail,
            typeOfContactUpdate,
          );
          await offboardRealmAdmin(session, updatedRealm, currentRequest.productOwnerEmail!, typeOfContactUpdate);
        }

        if (
          currentRequest.approved &&
          currentRequest.status === StatusEnum.APPLIED &&
          currentRequest.technicalContactEmail !== updateRequest.technicalContactEmail
        ) {
          typeOfContactUpdate = 'Technical Contact';
          await onboardNewRealmAdmin(
            session,
            updatedRealm,
            currentRequest.technicalContactEmail!,
            updatedRealm.technicalContactEmail,
            typeOfContactUpdate,
          );
          await offboardRealmAdmin(session, updatedRealm, currentRequest.technicalContactEmail!, typeOfContactUpdate);
        }
        // emails
        await sendUpdateEmail(updatedRealm, session, updatingApprovalStatus);
        if (isAdmin && updatingApprovalStatus && updatedRealm.approved) await sendReadyToUseEmail(currentRequest!);

        return res.send(updatedRealm);
      } catch (err) {
        await createEvent({
          realmId: parseInt(req.query.id as string, 10),
          eventCode: EventEnum.REQUEST_UPDATE_FAILED,
          idirUserId: username,
          details: getUpdatedProperties(currentRequest, updatedRealm),
        });
        console.error(err);
        return res.status(500).json({ success: false, error: 'update failed' });
      }
    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!isAdmin) return res.status(401).send('Unauthorized');

      const realm = await prisma.roster.findUnique({
        where: {
          id: parseInt(id as string, 10),
          archived: false,
        },
      });

      if (!realm) return res.status(404).send('Not found');

      await prisma.roster.update({
        data: {
          status: StatusEnum.PLANNED,
        },
        where: {
          id: parseInt(id as string, 10),
        },
      });

      let realmsDisabled = true;

      try {
        for (const env of realm.environments) {
          if (app_env === 'production') await disableCustomRealm(realm.realm!, env);
          // delete custom realms in non production environments
          else await deleteCustomRealm(realm.realm!, env);
        }
      } catch (err) {
        console.error(err);
        realmsDisabled = false;
      }

      await prisma.roster.update({
        data: {
          archived: true,
          status: realmsDisabled ? StatusEnum.APPLIED : StatusEnum.APPLYFAILED,
        },
        where: {
          id: parseInt(id as string, 10),
        },
      });

      await createEvent({
        realmId: parseInt(req.query.id as string, 10),
        eventCode: realmsDisabled ? EventEnum.REQUEST_DELETE_SUCCESS : EventEnum.REQUEST_DELETE_FAILED,
        idirUserId: username,
        details: req.body,
      });

      if (!realmsDisabled) {
        return res.status(422).send('Unable to process the delete request at this time');
      }

      await Promise.all(
        ['dev', 'test', 'prod'].map((env) => {
          return removeUserAsRealmAdmin(
            [realm.productOwnerEmail, realm.technicalContactEmail],
            env,
            realm.realm as string,
          );
        }),
      );

      await sendDeletionCompleteEmail(realm);
      return res.status(200).send('Success');
    } else {
      return res.status(405).json({ success: false, error: 'Not allowed' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
