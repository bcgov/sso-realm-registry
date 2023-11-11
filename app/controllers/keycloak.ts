import { RoleMappingPayload } from 'keycloak-admin/lib/defs/roleRepresentation';
import KeycloakCore from 'utils/keycloak-core';

export const addUserAsRealmAdmin = async (username: string, envs: string[], realmName: string) => {
  for (const env of envs) {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    let idirRealmUser;
    let masterRealmUser;
    const userGuid = username.split('@')[0].toLowerCase();

    let idirRealmUsers = await kcAdminClient.users.find({
      realm: 'idir',
      username: userGuid,
      max: 1,
    });

    if (idirRealmUsers.length === 0) {
      idirRealmUser = await kcAdminClient.users.create({
        realm: 'idir',
        username,
        emailVerified: true,
      });
    } else {
      idirRealmUser = idirRealmUsers[0];
    }

    const masterRealmUsers = await kcAdminClient.users.find({
      realm: 'master',
      username: username.toLowerCase(),
      max: 1,
    });

    if (masterRealmUsers.length === 0) {
      masterRealmUser = await kcAdminClient.users.create({
        realm: 'master',
        username,
        emailVerified: true,
      });
    } else {
      masterRealmUser = masterRealmUsers[0];
    }

    const links = await kcAdminClient.users.listFederatedIdentities({ realm: 'master', id: masterRealmUser.id! });

    if (links.length === 0) {
      await kcAdminClient.users.addToFederatedIdentity({
        realm: 'master',
        id: masterRealmUser.id!,
        federatedIdentityId: 'idir',
        federatedIdentity: {
          userId: userGuid,
          userName: userGuid,
          identityProvider: 'idir',
        },
      });
    }

    const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name: `${realmName}-realm-admin` });

    const roleMapping: RoleMappingPayload = { id: role?.id as string, name: role?.name as string };

    await kcAdminClient.users.addRealmRoleMappings({
      realm: 'master',
      id: masterRealmUser.id as string,
      roles: [roleMapping],
    });
  }
};
