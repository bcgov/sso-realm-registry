import getConfig from 'next/config';
import KcAdminClient from 'keycloak-admin';
import UserRepresentation from 'keycloak-admin/lib/defs/userRepresentation';
import flatten from 'lodash/flatten';
import validator from 'validator';

const { serverRuntimeConfig = {} } = getConfig() || {};
const {
  dev_kc_url,
  dev_kc_client_id,
  dev_kc_client_secret,
  test_kc_url,
  test_kc_client_id,
  test_kc_client_secret,
  prod_kc_url,
  prod_kc_client_id,
  prod_kc_client_secret,
} = serverRuntimeConfig;

class KeycloakCore {
  private _url: string = '';
  private _clientId: string = '';
  private _clientSecret: string = '';

  private _cachedRealmNames: any[] = [];
  private _cachedNames: any = {};
  private _cachedIDPNames: any = {};

  constructor(env: string) {
    if (env === 'dev') {
      this._url = dev_kc_url;
      this._clientId = dev_kc_client_id;
      this._clientSecret = dev_kc_client_secret;
    } else if (env === 'test') {
      this._url = test_kc_url;
      this._clientId = test_kc_client_id;
      this._clientSecret = test_kc_client_secret;
    } else if (env === 'prod') {
      this._url = prod_kc_url;
      this._clientId = prod_kc_client_id;
      this._clientSecret = prod_kc_client_secret;
    }
  }

  public async getAdminClient() {
    const kcAdminClient = new KcAdminClient({
      baseUrl: `${this._url}/auth`,
      realmName: 'master',
      requestConfig: {
        /* Axios request config options https://github.com/axios/axios#request-config */
        timeout: 0,
      },
    });

    await kcAdminClient.auth({
      grantType: 'client_credentials',
      clientId: this._clientId,
      clientSecret: this._clientSecret,
    });

    return kcAdminClient as KcAdminClient;
  }

  public async getRealmNames() {
    if (this._cachedRealmNames.length > 0) return this._cachedRealmNames;

    const kcAdminClient = await this.getAdminClient();
    if (!kcAdminClient) return null;

    const realms = await kcAdminClient.realms.find({});

    this._cachedRealmNames = realms.map((realm) => realm.realm);
    return this._cachedRealmNames;
  }

  public async findIdirUser(idirUsername: string) {
    const kcAdminClient = await this.getAdminClient();
    if (!kcAdminClient) return null;

    const users = await kcAdminClient.users.find({
      realm: 'idir',
      username: idirUsername,
    });

    const user = users.find((user) => user.username?.toLowerCase() === idirUsername?.toLowerCase());
    if (!user) return null;

    return user;
  }

  public async findUser(username: string) {
    try {
      const kcAdminClient = await this.getAdminClient();
      if (!kcAdminClient) return null;

      const realmNames = (await this.getRealmNames()) || [];
      let users = await Promise.all(
        realmNames.map(async (realm) => {
          const getProms = (query: any) =>
            kcAdminClient.users.find(query).then((users) => users.map((user) => ({ ...user, realm })));

          if (validator.isEmail(username)) return getProms({ realm, email: username });
          else return getProms({ realm, username: realm !== 'idir' ? `${username}@idir` : username });
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

  public async getIdirUserName(idirUsername: string) {
    try {
      if (this._cachedNames[idirUsername]) return this._cachedNames[idirUsername];
      const user = await this.findIdirUser(idirUsername);
      if (!user) return null;

      const name = `${user.firstName} ${user.lastName}`;
      this._cachedNames[idirUsername] = name;
      return name;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  public async getIDPs(realm: string) {
    try {
      const kcAdminClient = await this.getAdminClient();
      if (!kcAdminClient) return null;

      const idps = await kcAdminClient.identityProviders.find({ realm } as any);

      return idps;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  public async getIDPNames(realm: string) {
    try {
      if (this._cachedIDPNames[realm]) return this._cachedIDPNames[realm];
      const idps = await this.getIDPs(realm);
      if (!idps) return null;

      const names = idps.map((idp) => idp.displayName || idp.alias);
      this._cachedIDPNames[realm] = names;
      return names;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  public async getRealm(realm: string) {
    try {
      const kcAdminClient = await this.getAdminClient();
      if (!kcAdminClient) return null;

      const realmData = await kcAdminClient.realms.findOne({ realm } as any);

      return realmData;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  public async deleteUser(realm: string, userid: string) {
    try {
      const kcAdminClient = await this.getAdminClient();
      if (!kcAdminClient) return null;

      return kcAdminClient.users.del({ id: userid, realm });
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}

export default KeycloakCore;
