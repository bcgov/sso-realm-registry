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
      let users: string[] = [];
      const { email } = req.query;

      if (email) {
        const url = `https://graph.microsoft.com/v1.0/users?$filter=startswith(mail,'${email}')&$orderby=userPrincipalName&$count=true&$top=25`;
        await callAzureGraphApi(url).then((res) => {
          users = res.value;
        });
      }
      return res.send(users);
    } catch (err: any) {
      console.error('error:', err);
      return res.status(503).json({ success: false, error: err.message || err });
    }
  } else {
    return res.status(404).json({ success: false, error: 'not found' });
  }
}
