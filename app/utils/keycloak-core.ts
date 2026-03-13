import KcAdminClient from '@keycloak/keycloak-admin-client';
import RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation.js';
import flatten from 'lodash/flatten';
import compact from 'lodash/compact';
import validator from 'validator';

class KeycloakCore {
  private _url: string = '';
  private _username: string = '';
  private _password: string = '';

  private _cachedRealms: RealmRepresentation[] = [];
  private _cachedNames: any = {};
  private _cachedIDPNames: any = {};
  private _adminClient!: KcAdminClient;

  constructor(env: string) {
    if (env === 'dev') {
      this._url = process.env.DEV_KC_URL ?? '';
      this._username = process.env.DEV_KC_USERNAME ?? '';
      this._password = process.env.DEV_KC_PASSWORD ?? '';
    } else if (env === 'test') {
      this._url = process.env.TEST_KC_URL ?? '';
      this._username = process.env.TEST_KC_USERNAME ?? '';
      this._password = process.env.TEST_KC_PASSWORD ?? '';
    } else if (env === 'prod') {
      this._url = process.env.PROD_KC_URL ?? '';
      this._username = process.env.PROD_KC_USERNAME ?? '';
      this._password = process.env.PROD_KC_PASSWORD ?? '';
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

  public async getRealms() {
    if (this._cachedRealms.length > 0) return this._cachedRealms;

    const adminClient = await this.getAdminClient();
    if (!adminClient) return [];

    this._cachedRealms = await adminClient.realms.find({});
    return this._cachedRealms;
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
      const realmNames = (await this.getRealms()).map((realm) => realm.realm) || [];

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
