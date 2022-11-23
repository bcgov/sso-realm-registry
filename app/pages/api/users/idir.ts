import type { NextApiRequest, NextApiResponse } from 'next';
import { validateRequest } from 'utils/jwt';
import KeycloakCore from 'utils/keycloak-core';
import { getAllowedRealms, getAllowedRealmNames } from 'controllers/realm';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string | any;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const session = await validateRequest(req, res);
    if (!session) return res.status(401).json({ success: false, error: 'jwt expired' });

    const { search, env } = req.query;
    const searchParam = String(search);

    if (searchParam?.length < 3)
      return res.status(401).json({ success: false, error: 'search key less than 3 characters' });

    const runIdirUser = async (kcCore: any) => {
      let users: any[] = (await kcCore.findUser(searchParam)) || [];
      if (users.length === 0) {
        return { result: 'notfound' };
      }

      if (users.length === 1 && users[0].realm === 'idir') {
        return { result: 'idironly', username: users[0].username, userid: users[0].id };
      }

      users = users.filter((user) => user.realm !== 'idir');
      if (users.length === 0) {
        return { result: 'notfound' };
      }

      const myRealmNames = await getAllowedRealmNames(session);

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
      const kcCoreDev = new KeycloakCore('dev');
      const kcCoreTest = new KeycloakCore('test');
      const kcCoreProd = new KeycloakCore('prod');

      const [dev, test, prod] = await Promise.all([
        runIdirUser(kcCoreDev),
        runIdirUser(kcCoreTest),
        runIdirUser(kcCoreProd),
      ]);

      return res.send({ dev, test, prod });
    } else if (req.method === 'DELETE') {
      const kcCore = new KeycloakCore(env as string);
      const result = await runIdirUser(kcCore);
      if (result.result === 'idironly') {
        await kcCore.deleteUser('idir', result.userid);
        return res.send({ success: true });
      }
      return res.send({ success: false });
    }
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
