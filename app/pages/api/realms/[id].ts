import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { RoleEnum, adminOnlyFields, checkAdminRole, createEvent, getUpdatedProperties } from 'utils/helpers';
import prisma from 'utils/prisma';
import { EventEnum, StatusEnum, getUpdateRealmSchemaByRole } from 'validators/create-realm';
import { ValidationError } from 'yup';
import {
  CreatePullRequestResponseType,
  createCustomRealmPullRequest,
  deleteBranch,
  mergePullRequest,
} from 'utils/github';
import omit from 'lodash.omit';
import { sendDeleteEmail, sendUpdateEmail } from 'utils/mailer';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  let username: string;
  let currentRequest;
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
        const lastUpdatedBy = `${session.user.family_name}, ${session.user.given_name}`;

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

        if (!currentRequest) {
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
            !currentRequest.prNumber &&
            !currentRequest.approved
          ) {
            updatingApprovalStatus = true;
            await createEvent({
              realmId: parseInt(req.query.id as string, 10),
              eventCode: EventEnum.REQUEST_APPROVE_SUCCESS,
              idirUserId: username,
              details: req.body,
            });
            const prResponse: CreatePullRequestResponseType = await createCustomRealmPullRequest(
              currentRequest.realm!,
              currentRequest.environments,
            );
            const pr = await mergePullRequest(prResponse.data.number);
            if (pr.data.merged) await deleteBranch(currentRequest.realm!);
            updateRequest.prNumber = prResponse.data.number;
            updateRequest.status = updateRequest.prNumber ? StatusEnum.PRSUCCESS : StatusEnum.PRFAILED;
            updateRequest.approved = true;

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
        sendUpdateEmail(updatedRealm, session, updatingApprovalStatus).catch((err) =>
          console.error(`Error sending email for ${updatedRealm.realm}`, err),
        );
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

      const prResponse: CreatePullRequestResponseType | null = await createCustomRealmPullRequest(
        realm.realm!,
        realm.environments,
        false,
      ).catch((err) => {
        console.error(`Error creating pr for realm id ${id}: ${err}`);
        return null;
      });

      const failPR = () => {
        return Promise.all([
          prisma.roster.update({ data: { status: StatusEnum.PRFAILED }, where: { id: parseInt(id as string, 10) } }),
          createEvent({
            realmId: parseInt(req.query.id as string, 10),
            eventCode: EventEnum.REQUEST_DELETE_FAILED,
            idirUserId: username,
          }),
        ]);
      };

      if (!prResponse?.data.number) {
        console.info(`PR Failed for deletion of realm id ${id}`);
        // Intentionally not awaiting since 500 already, handling error async
        failPR().catch((err) => console.error(err));
        return res.status(500).send('Unexpected error removing request. Please try again.');
      }

      const pr = await mergePullRequest(prResponse.data.number);
      if (!pr.data.merged) {
        console.info(`Failed to merge pull request for realm id ${id}`);
        failPR().catch((err) => console.error(err));
        return res.status(500).send('Unexpected error removing request. Please try again.');
      }

      await deleteBranch(realm.realm!);

      prisma.roster.update({
        data: {
          archived: true,
          prNumber: prResponse.data.number,
          status: StatusEnum.PRSUCCESS,
        },
        where: {
          id: parseInt(id as string, 10),
        },
      });
      sendDeleteEmail(realm, session);
      res.status(200).send('Success');
    } else {
      return res.status(404).json({ success: false, error: 'not found' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
}
