import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from 'utils/prisma';
import { sendDeletedUserEmail } from 'utils/mailer';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string | any;

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
      const rosters = await prisma.roster.findMany({
        where: {
          archived: false,
          status: 'applied',
          approved: true,
          OR: [
            {
              technicalContactIdirUserId: {
                equals: id,
                mode: 'insensitive',
              },
            },
            {
              secondTechnicalContactIdirUserId: {
                equals: id,
                mode: 'insensitive',
              },
            },
            {
              productOwnerIdirUserId: {
                equals: id,
                mode: 'insensitive',
              },
            },
          ],
        },
      });
      if (rosters.length > 0) {
        await sendDeletedUserEmail(rosters, id);
      }
      res.status(200).send('OK');
    } else {
      res.status(405).send('method not allowed');
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false });
  }
}
