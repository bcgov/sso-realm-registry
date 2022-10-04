import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import jws from 'jws';
import jwkToPem from 'jwk-to-pem';
import axios from 'axios';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { jwt_secret, idir_jwks_uri, idir_issuer, idir_audience } = serverRuntimeConfig;

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

export const getIdirUserGuid = async (token: string) => {
  const { header } = jws.decode(token);

  const { keys }: any = await axios.get(idir_jwks_uri).then((res) => res.data);

  const key = keys.find((jwkKey: any) => jwkKey.kid === header.kid);
  const isValidKid = !!key;

  if (!isValidKid) return null;

  const pem = jwkToPem(key);

  const { identity_provider, idir_username }: any = jwt.verify(token, pem, {
    audience: idir_audience,
    issuer: idir_issuer,
    maxAge: '8h',
    ignoreExpiration: true,
  });

  if (!['idir', 'azureidir'].includes(identity_provider)) return null;

  return idir_username;
};
