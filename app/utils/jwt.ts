import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import jws from 'jws';
import jwkToPem from 'jwk-to-pem';
import axios from 'axios';

type Data = {
  success: boolean;
  error: string | object;
};

export const validateRequest = async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  try {
    const bearerToken = req.headers['authorization'];
    return jwt.verify((bearerToken as string).split('Bearer ')[1], process.env.JWT_SECRET ?? '') as any;
  } catch (error: any) {
    console.error(error);
    return null;
  }
};

export const getIdirUserGuid = async (token: string) => {
  const { header } = jws.decode(token) as jws.Signature;

  const { keys }: any = await axios.get(process.env.IDIR_JWKS_URI ?? '').then((res) => res.data);

  const key = keys.find((jwkKey: any) => jwkKey.kid === header.kid);
  const isValidKid = !!key;

  if (!isValidKid) return null;

  const pem = jwkToPem(key);

  const { identity_provider, idir_user_guid }: any = jwt.verify(token, pem, {
    audience: process.env.IDIR_AUDIENCE,
    issuer: process.env.IDIR_ISSUER,
    maxAge: '8h',
    ignoreExpiration: true,
  });

  if (!['idir', 'azureidir'].includes(identity_provider)) return null;

  return idir_user_guid;
};
