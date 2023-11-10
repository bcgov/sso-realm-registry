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
import { sendUpdateEmail } from 'utils/mailer';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  let username;
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
        } else if (currentRequest.status !== StatusEnum.PENDING && updateRequest.approved) {
          return res.status(400).json({ success: false, error: 'Request is in invalid stage' });
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
          if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'true' &&
            !currentRequest.prNumber &&
            !currentRequest.approved
          ) {
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
          } else if (
            currentRequest.status === StatusEnum.PENDING &&
            String(updateRequest.approved) === 'false' &&
            !currentRequest.prNumber
          ) {
            await createEvent({
              realmId: parseInt(req.query.id as string, 10),
              eventCode: EventEnum.REQUEST_REJECT_SUCCESS,
              idirUserId: username,
              details: req.body,
            });
            updateRequest.approved = false;
          }
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

        await createEvent({
          realmId: parseInt(req.query.id as string, 10),
          eventCode: EventEnum.REQUEST_UPDATE_SUCCESS,
          idirUserId: username,
          details: getUpdatedProperties(currentRequest, updatedRealm),
        });
        updatedRealm = !isAdmin ? omit(updatedRealm, adminOnlyFields) : updatedRealm;
        sendUpdateEmail(updatedRealm, session);
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
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
}
