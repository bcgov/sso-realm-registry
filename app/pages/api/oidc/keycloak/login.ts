import type { NextApiRequest, NextApiResponse } from 'next';
import { createOIDC } from 'utils/oidc-conn';

type Data = {
  success: boolean;
  error: string | object;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const oidc = createOIDC();
    const authUrl = await oidc.getAuthorizationUrl({ kc_idp_hint: 'idir' });
    return res.redirect(authUrl);
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
