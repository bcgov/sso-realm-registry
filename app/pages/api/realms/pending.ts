import { addUserAsRealmAdmin } from 'controllers/keycloak';
import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';
import { createEvent, getUpdatedProperties } from 'utils/helpers';
import { generateXML, getBceidAccounts, makeSoapRequest } from 'utils/idir';
import prisma from 'utils/prisma';
import { ActionEnum, EventEnum, StatusEnum, realmPlanAndApplySchema } from 'validators/create-realm';
import { ValidationError } from 'yup';
import { removeUserAsRealmAdmin } from 'controllers/keycloak';
import { sendDeletionCompleteEmail, sendReadyToUseEmail } from 'utils/mailer';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { gh_api_token, idir_requestor_user_guid } = serverRuntimeConfig;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { Authorization, authorization } = req.headers || {};
    const authHeader = Authorization || authorization;
    if (!authHeader || authHeader !== gh_api_token) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    if (req.method === 'GET') {
      const pending = await prisma.roster.findMany({
        where: {
          status: StatusEnum.PRSUCCESS,
          approved: true,
        },
      });
      return res.status(200).json(pending.map((r: any) => r.id));
    } else if (req.method === 'PUT') {
      let data = req.body;
      try {
        data = realmPlanAndApplySchema.validateSync(req.body, { abortEarly: false, stripUnknown: true });
      } catch (e) {
        const error = e as ValidationError;
        return res.status(400).json({ success: false, error: error.errors });
      }
      let { ids, action, success } = data;
      let updatedRealm;
      let newStatus: string;
      let newEvent: string;

      success = String(success) === 'true';

      if (success) {
        if (action === ActionEnum.TF_PLAN) {
          newStatus = StatusEnum.PLANNED;
          newEvent = EventEnum.REQUEST_PLAN_SUCCESS;
        } else {
          newStatus = StatusEnum.APPLIED;
          newEvent = EventEnum.REQUEST_APPLY_SUCCESS;
        }
      } else {
        if (action === ActionEnum.TF_PLAN) {
          newStatus = StatusEnum.PLANFAILED;
          newEvent = EventEnum.REQUEST_PLAN_FAILED;
        } else {
          newStatus = StatusEnum.APPLYFAILED;
          newEvent = EventEnum.REQUEST_APPLY_FAILED;
        }
      }
      const updateRosterPromises = ids.map(async (id: number) => {
        const currentRequest = await prisma.roster.findUnique({
          where: {
            id,
          },
        });

        updatedRealm = await prisma.roster.update({
          where: {
            id,
          },
          data: {
            status: newStatus,
            lastUpdatedBy: 'Pathfinder-SSO-Team',
          },
        });

        await createEvent({
          realmId: currentRequest?.id,
          eventCode: newEvent,
          idirUserId: 'Pathfinder-SSO-Team',
          details: getUpdatedProperties(currentRequest, updatedRealm),
        });

        const disablingRealm = currentRequest?.archived && newStatus === StatusEnum.APPLIED;
        if (disablingRealm) {
          await Promise.all(
            ['dev', 'test', 'prod'].map((env) => {
              return removeUserAsRealmAdmin(
                [currentRequest.productOwnerEmail, currentRequest.technicalContactEmail],
                env,
                currentRequest.realm as string,
              );
            }),
          );
          await sendDeletionCompleteEmail(currentRequest);
        } else if (success && action === ActionEnum.TF_APPLY) {
          const currentRequest = await prisma.roster.findUnique({
            where: {
              id,
            },
          });

          try {
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
            sendReadyToUseEmail(currentRequest!).catch((err) =>
              console.error(`Error sending email for ${currentRequest?.realm}`, err),
            );
          } catch (err) {
            console.trace(err);
            console.error(err);
          }
        }
      });

      await Promise.all(updateRosterPromises);
      res.status(200).json({ success: true });
    } else {
      return res.status(404).json({ success: false, error: 'not found' });
    }
  } catch (err) {
    console.error(`Exception: ${err}`);
    res.status(500).send('server error');
  }
}
