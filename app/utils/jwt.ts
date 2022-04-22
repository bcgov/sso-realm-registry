import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { jwt_secret } = serverRuntimeConfig;

type Data = {
  success: boolean;
  error: string | object;
};

export const validateRequest = async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  try {
    const bearerToken = req.headers['authorization'];
    return jwt.verify((bearerToken as string).split('Bearer ')[1], jwt_secret) as any;
  } catch (error: any) {
    console.error(error);
    return null;
  }
};
