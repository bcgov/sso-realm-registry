import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from 'utils/prisma';
import { authOptions } from './auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      const { realmId } = req.query;
      const events = await prisma.event.findMany({
        where: {
          realmId: parseInt(realmId as string, 10),
        },
      });
      return res.status(200).json(events);
    } catch (err) {
      return res.status(500).json({ message: 'Error fetching events' });
    }
  }
}
