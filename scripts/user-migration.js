import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

const getBasename = (username) => username.split('@')[0];

const createAzureIdirRealmUser = async (kcAdminClient, realm, idirUser) => {
  const azureIdirRealmUser = await kcAdminClient.users.create({
    realm: 'azureidir',
    username: getBasename(idirUser.username),
    email: idirUser.email,
    enabled: true,
  });

  await kcAdminClient.users.addToFederatedIdentity({
    realm: 'azureidir',
    id: azureIdirRealmUser.id,
    federatedIdentityId: 'azureidir',
    federatedIdentity: {
      userId: getBasename(idirUser.username).toLowerCase(),
      userName: getBasename(idirUser.username).toLowerCase(),
      identityProvider: 'azureidir',
    },
  });
};

const createAzureIdirMasterUser = async (kcAdminClient, idirUser, realmAdminRole) => {
  const azureIdirMasterUser = await kcAdminClient.users.create({
    realm: 'master',
    username: `${getBasename(idirUser.username)}@azureidir`,
    email: idirUser.email,
    enabled: true,
    attributes: idirUser.attributes,
  });

  await kcAdminClient.users.addToFederatedIdentity({
    realm: 'master',
    id: azureIdirMasterUser.id,
    federatedIdentityId: 'azureidir',
    federatedIdentity: {
      userId: getBasename(idirUser.username).toLowerCase(),
      userName: getBasename(idirUser.username).toLowerCase(),
      identityProvider: 'azureidir',
    },
  });
  return azureIdirMasterUser;
};

const processIdirUser = async (kcAdminClient, realm, users, realmAdminRole) => {
  const idirUser = users.find((u) => u.username.toLowerCase().endsWith('@idir'));
  if (!idirUser) return;

  const idirUserRealmRoleMappings = await kcAdminClient.users.listRealmRoleMappings({
    realm: 'master',
    id: idirUser.id,
  });

  const idirUserHasRealmAdminRole = idirUserRealmRoleMappings.find((role) => role.id === realmAdminRole?.id);

  const azureIdirRealmUsers = await kcAdminClient.users.find({
    realm: 'azureidir',
    username: getBasename(idirUser.username),
    max: 1,
  });

  if (!azureIdirRealmUsers || azureIdirRealmUsers.length === 0) {
    await createAzureIdirRealmUser(kcAdminClient, realm, idirUser);
  }

  let azureIdirMasterUser = users.find((u) => u.username.toLowerCase().endsWith('@azureidir'));

  if (!azureIdirMasterUser) {
    azureIdirMasterUser = await createAzureIdirMasterUser(kcAdminClient, idirUser, realmAdminRole);
  }

  const azureIdirMasterUserRealmRoleMappings = await kcAdminClient.users.listRealmRoleMappings({
    realm: 'master',
    id: azureIdirMasterUser.id,
  });

  const azureidirUserHasRealmAdminRole = azureIdirMasterUserRealmRoleMappings.find(
    (role) => role.id === realmAdminRole?.id,
  );

  if (!azureidirUserHasRealmAdminRole) {
    await kcAdminClient.users.addRealmRoleMappings({
      realm: 'master',
      id: azureIdirMasterUser.id,
      roles: [{ id: realmAdminRole?.id, name: realmAdminRole?.name }],
    });
  }

  if (idirUserHasRealmAdminRole) {
    await kcAdminClient.users.delRealmRoleMappings({
      realm: 'master',
      id: idirUser.id,
      roles: [{ id: realmAdminRole?.id, name: realmAdminRole?.name }],
    });
  }
};

const processEmailForRealm = async (kcAdminClient, realm, email, realmAdminRole) => {
  const users = await kcAdminClient.users.find({
    realm: 'master',
    email,
  });

  if (users.length !== 0) {
    await processIdirUser(kcAdminClient, realm, users, realmAdminRole);
  }
};

const processRealm = async (kcAdminClient, realm) => {
  const realmAdminRole = await kcAdminClient.roles.findOneByName({
    realm: 'master',
    name: `${realm.realm}-realm-admin`,
  });

  const emails = [realm.product_owner_email, realm.technical_contact_email, realm.second_technical_contact_email];

  for (const email of emails) {
    try {
      await processEmailForRealm(kcAdminClient, realm, email, realmAdminRole);
    } catch (error) {
      console.error(`Error creating user ${email} in realm ${realm.realm}:`, error);
    }
  }
};

const authenticateClient = async (kcAdminClient, env) => {
  await kcAdminClient.auth({
    username: process.env[`${env.toUpperCase()}_KC_USERNAME`],
    password: process.env[`${env.toUpperCase()}_KC_PASSWORD`],
    grantType: 'password',
    clientId: 'admin-cli',
  });
};

const migrateUsers = async () => {
  const realms = JSON.parse(fs.readFileSync('./realm-users.json', 'utf-8'));

  for (const env of ['dev']) {
    const kcAdminClient = new KcAdminClient({
      baseUrl: `${process.env[`${env.toUpperCase()}_KC_URL`]}/auth`,
      realmName: 'master',
    });

    await authenticateClient(kcAdminClient, env);

    for (const realm of realms) {
      await processRealm(kcAdminClient, realm);
    }
  }
};

migrateUsers();
