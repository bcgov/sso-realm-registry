import getConfig from 'next/config';
import KcAdminClient from 'keycloak-admin';
import UserRepresentation from 'keycloak-admin/lib/defs/userRepresentation';
import flatten from 'lodash/flatten';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { kc_url, kc_client_id, kc_client_secret } = serverRuntimeConfig;

export async function getAdminClient() {
  try {
    const kcAdminClient = new KcAdminClient({
      baseUrl: `${kc_url}/auth`,
      realmName: 'master',
      requestConfig: {
        /* Axios request config options https://github.com/axios/axios#request-config */
        timeout: 60000,
      },
    });

    await kcAdminClient.auth({
      grantType: 'client_credentials',
      clientId: kc_client_id,
      clientSecret: kc_client_secret,
    });

    return kcAdminClient as KcAdminClient;
  } catch (err) {
    console.error(err);
    return null;
  }
}

let _cachedRealmNames: any[] = [];
export async function getRealmNames() {
  try {
    if (_cachedRealmNames.length > 0) return _cachedRealmNames;

    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    const realms = await kcAdminClient.realms.find({});

    _cachedRealmNames = realms.map((realm) => realm.realm);
    return _cachedRealmNames;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function findIdirUser(idirUsername: string) {
  try {
    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    const users = await kcAdminClient.users.find({
      realm: 'idir',
      username: idirUsername,
    });

    const user = users.find((user) => user.username?.toLowerCase() === idirUsername?.toLowerCase());
    if (!user) return null;

    return user;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function findUser(username: string) {
  try {
    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    const realmNames = (await getRealmNames()) || [];
    let users = await Promise.all(
      realmNames.map(async (realm) => {
        const getProms = (query: any) =>
          kcAdminClient.users.find(query).then((users) => users.map((user) => ({ ...user, realm })));

        const searchKey = realm !== 'idir' ? `${username}@idir` : username;
        const results = await Promise.all([
          getProms({ realm, username: searchKey }),
          getProms({ realm, email: username }),
        ]);
        return flatten(results) as any[];
      }),
    );

    users = flatten(users) as any[];
    return users.filter((user: any) => {
      const searchKey = user.realm !== 'idir' ? `${username}@idir` : username;
      return user.username === searchKey || user.email === username;
    });
  } catch (err) {
    console.error(err);
    return null;
  }
}

const _cachedNames: any = {};
export async function getIdirUserName(idirUsername: string) {
  try {
    if (_cachedNames[idirUsername]) return _cachedNames[idirUsername];
    const user = await findIdirUser(idirUsername);
    if (!user) return null;

    const name = `${user.firstName} ${user.lastName}`;
    _cachedNames[idirUsername] = name;
    return name;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getIDPs(realm: string) {
  try {
    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    const idps = await kcAdminClient.identityProviders.find({ realm } as any);

    return idps;
  } catch (err) {
    console.error(err);
    return null;
  }
}

const _cachedIDPNames: any = {};
export async function getIDPNames(realm: string) {
  try {
    if (_cachedIDPNames[realm]) return _cachedIDPNames[realm];
    const idps = await getIDPs(realm);
    if (!idps) return null;

    const names = idps.map((idp) => idp.displayName || idp.alias);
    _cachedIDPNames[realm] = names;
    return names;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getRealm(realm: string) {
  try {
    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    const realmData = await kcAdminClient.realms.findOne({ realm } as any);

    return realmData;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function deleteUser(realm: string, userid: string) {
  try {
    const kcAdminClient = await getAdminClient();
    if (!kcAdminClient) return null;

    return kcAdminClient.users.del({ id: userid, realm });
  } catch (err) {
    console.error(err);
    return null;
  }
}
