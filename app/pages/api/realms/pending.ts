import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';
import { createEvent, getUpdatedProperties } from 'utils/helpers';
import prisma from 'utils/prisma';
import { ActionEnum, EventEnum, StatusEnum } from 'validators/create-realm';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { gh_api_token } = serverRuntimeConfig;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    let { ids, action, success } = req.body;
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

    ids.map(async (id: number) => {
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
        },
      });

      await createEvent({
        realmId: currentRequest?.id,
        eventCode: newEvent,
        idirUserId: 'Pathfinder-SSO-Team',
        details: getUpdatedProperties(currentRequest, updatedRealm),
      });
    });

    return res.status(200).json({ success: true });
  }
}
