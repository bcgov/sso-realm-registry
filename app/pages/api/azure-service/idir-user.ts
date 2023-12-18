import type { NextApiRequest, NextApiResponse } from 'next';
import { getIdirUserGuid } from 'utils/jwt';
import { SearchCriteria, generateXML, getBceidAccounts, makeSoapRequest } from 'utils/idir';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { callAzureGraphApi } from 'controllers/msal';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method === 'GET') {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });
      const { id } = req.query;

      if (id) {
        const url = `https://graph.microsoft.com/v1.0/users/${id}?$select=onPremisesSamAccountName`;
        await callAzureGraphApi(url).then((r) => {
          return res.send(r.onPremisesSamAccountName);
        });
      } else {
        return res.status(400).json({ success: false, error: 'User id not found' });
      }
    } catch (err: any) {
      console.error('error:', err);
      return res.status(503).json({ success: false, error: err.message || err });
    }
  } else {
    return res.status(404).json({ success: false, error: 'not found' });
  }
}
