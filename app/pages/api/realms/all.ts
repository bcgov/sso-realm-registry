import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllowedRealms } from 'controllers/realm';
import { getSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    const realms = await getAllowedRealms(session);
    return res.send(realms);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}
