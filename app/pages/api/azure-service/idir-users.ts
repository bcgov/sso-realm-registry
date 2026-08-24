import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { callAzureGraphApi } from 'controllers/msal';
import { odataString } from 'utils/helpers';

/**
 * Directory search behind the realm form's email pickers. The IDIR username is selected
 * here so a selection needs no follow up lookup; the guid is deliberately not returned,
 * since the server re-resolves identity from the Azure object id on save.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method === 'GET') {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });
      let users: any[] = [];
      const { email } = req.query;

      if (Array.isArray(email)) {
        return res.status(400).json({ success: false, error: 'malformed content' });
      }

      if (email) {
        await callAzureGraphApi({
          pathSegments: ['users'],
          query: {
            $filter: `startswith(mail,${odataString(email)})`,
            $select: 'id,mail,displayName,onPremisesSamAccountName,mailNickname',
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
