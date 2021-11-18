import type { NextApiRequest, NextApiResponse } from 'next';
import { validateRequest } from 'utils/jwt';
import { findUser, deleteUser } from 'utils/keycloak-core';
import { getMyRealms } from 'controllers/realm';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string | any;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const session = await validateRequest(req, res);
    if (!session) return res.status(401).json({ success: false, error: 'jwt expired' });

    const { search } = req.query;
    const idirId = session?.preferred_username.split('@')[0];

    const runIdirUser = async () => {
      let users: any[] = (await findUser(search as string)) || [];
      if (users.length === 0) {
        return { result: 'notfound' };
      }

      if (users.length === 1 && users[0].realm === 'idir') {
        return { result: 'idironly', username: users[0].username, userid: users[0].id };
      }

      users = users.filter((user) => user.realm !== 'idir');

      const myRealms = await getMyRealms(idirId);
      const myRealmNames = myRealms.map((v: any) => v.realm);

      const affected = [];
      let includeOthers = false;
      for (let x = 0; x < users.length; x++) {
        const user = users[x];
        if (myRealmNames.includes(user.realm)) affected.push(user.realm);
        else {
          includeOthers = true;
          break;
        }
      }

      if (includeOthers) {
        return { result: 'others', username: users[0].username.split('@')[0] };
      }

      return { result: 'found', affected, username: users[0].username.split('@')[0] };
    };

    if (req.method === 'GET') {
      const result = await runIdirUser();
      return res.send(result);
    } else if (req.method === 'DELETE') {
      const result = await runIdirUser();
      if (result.result === 'idironly') {
        await deleteUser('idir', result.userid);
        return res.send({ success: true });
      }
      return res.send({ success: false });
    }
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
