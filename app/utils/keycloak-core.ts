import getConfig from 'next/config';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import flatten from 'lodash/flatten';
import compact from 'lodash/compact';
import validator from 'validator';

const { serverRuntimeConfig = {} } = getConfig() || {};
const {
  dev_kc_url,
  dev_kc_username,
  dev_kc_password,
  test_kc_url,
  test_kc_username,
  test_kc_password,
  prod_kc_url,
  prod_kc_username,
  prod_kc_password,
} = serverRuntimeConfig;

class KeycloakCore {
  private _url: string = '';
  private _username: string = '';
  private _password: string = '';

  private _cachedRealmNames: any[] = [];
  private _cachedNames: any = {};
  private _cachedIDPNames: any = {};
  private _adminClient!: KcAdminClient;

  constructor(env: string) {
    if (env === 'dev') {
      this._url = dev_kc_url;
      this._username = dev_kc_username;
      this._password = dev_kc_password;
    } else if (env === 'test') {
      this._url = test_kc_url;
      this._username = test_kc_username;
      this._password = test_kc_password;
    } else if (env === 'prod') {
      this._url = prod_kc_url;
      this._username = prod_kc_username;
      this._password = prod_kc_password;
    }
  }

  public async getAdminClient() {
    if (this._adminClient) return this._adminClient;

    const kcAdminClient = new KcAdminClient({
      baseUrl: `${this._url}/auth`,
      realmName: 'master',
      requestArgOptions: {
        catchNotFound: true,
      },
    });

    await kcAdminClient.auth({
      grantType: 'password',
      clientId: 'admin-cli',
      username: this._username,
      password: this._password,
    });

    this._adminClient = kcAdminClient;
    return kcAdminClient as KcAdminClient;
  }

  public async getRealmNames() {
    if (this._cachedRealmNames.length > 0) return this._cachedRealmNames;

    const adminClient = await this.getAdminClient();
    if (!adminClient) return [];

    const realms = await adminClient.realms.find({});

    this._cachedRealmNames = realms.map((realm) => realm.realm);
    return this._cachedRealmNames;
  }

  public async findIdirUser(idirUsername: string) {
    const adminClient = await this.getAdminClient();
    if (!adminClient) return null;

    const users = await adminClient.users.find({
      realm: 'idir',
      username: idirUsername,
    });

    const user = users.find((user) => user.username?.toLowerCase() === idirUsername?.toLowerCase());
    if (!user) return null;

    return user;
  }

  public async findUser(username: string) {
    const adminClient = await this.getAdminClient();
    if (!adminClient) return [];

    try {
      const realmNames = (await this.getRealmNames()) || [];

      let users = await Promise.all(
        realmNames.map((realm) => {
          const getProms = (query: any) =>
            adminClient.users
              .find(query)
              .then((users) => users.map((user) => ({ ...user, realm })))
              .catch((err) => {
                handleError(err);
                return null;
              });

          if (validator.isEmail(username)) return getProms({ realm, email: username, exact: true });
          else return getProms({ realm, username: realm !== 'idir' ? `${username}@idir` : username, exact: true });
        }),
      );

      return compact(flatten(users));
    } catch (err) {
      handleError(err);
      return [];
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
      handleError(err);
      return null;
    }
  }

  public async getIDPs(realm: string) {
    const adminClient = await this.getAdminClient();
    if (!adminClient) return null;

    try {
      const idps = await adminClient.identityProviders.find({ realm } as any);

      return idps;
    } catch (err) {
      handleError(err);
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
      handleError(err);
      return null;
    }
  }

  public async getRealm(realm: string) {
    const adminClient = await this.getAdminClient();
    if (!adminClient) return null;

    try {
      const realmData = await adminClient.realms.findOne({ realm } as any);

      return realmData;
    } catch (err) {
      handleError(err);
      return null;
    }
  }

  public async deleteUser(realm: string, userid: string) {
    const adminClient = await this.getAdminClient();
    if (!adminClient) return null;

    try {
      return adminClient.users.del({ id: userid, realm });
    } catch (err) {
      handleError(err);
      return null;
    }
  }
}

export default KeycloakCore;

function handleError(error: any) {
  if (error?.isAxiosError) {
    console.error(error.response?.data || error);
  } else {
    console.error(error);
  }
}
