import type { NextApiRequest, NextApiResponse } from 'next';
import { getIdirUserGuid } from 'utils/jwt';
import { SearchCriteria, generateXML, getBceidAccounts, makeSoapRequest } from 'utils/idir';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { callAzureGraphApi } from 'controllers/msal';
import { odataString } from 'utils/helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method === 'GET') {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });
      let users: string[] = [];
      const { email } = req.query;

      if (Array.isArray(email)) {
        return res.status(400).json({ success: false, error: 'malformed content' });
      }

      if (email) {
        await callAzureGraphApi({
          pathSegments: ['users'],
          query: {
            $filter: `startswith(mail,${odataString(email)})`,
            $orderBy: 'userPrincipalName',
            $count: 'true',
            $top: '25',
          },
        }).then((res) => {
          users = res.value;
        });
      }
      return res.send(users);
    } catch (err: any) {
      console.error('error:', err);
      return res.status(503).json({ success: false, error: 'unknown exception' });
    }
  } else {
    return res.status(404).json({ success: false, error: 'not found' });
  }
}
