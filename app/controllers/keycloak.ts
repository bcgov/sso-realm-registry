import { RoleMappingPayload } from 'keycloak-admin/lib/defs/roleRepresentation';
import KeycloakCore from 'utils/keycloak-core';

/**
 * Function to remove access at the master realm level as administrator of a custom realm. Custom realm owners access control comes from the role <realmname>-realm-admin. Removes this role from supplied usernames if found.
 * @param emails Usernames to remove
 * @param env The environment to cleanup
 * @param realm The realm name you want to remove access to
 */
export const removeUserAsRealmAdmin = async (emails: (string | null)[], env: string, realm: string) => {
  const kcCore = new KeycloakCore(env);
  const kcAdminClient = await kcCore.getAdminClient();
  const definedEmails = emails.filter((name) => name) as string[];

  const userPromises = definedEmails.map((email) =>
    kcAdminClient.users.find({
      realm: 'master',
      email,
    }),
  );

  const users = await Promise.all(userPromises);

  const userIds = users.map((user) => user?.[0]?.id).filter((user) => user) as string[];

  if (userIds.length === 0) {
    console.info(`No users found as admin for realm ${realm}.`);
    return;
  }

  const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name: `${realm}-realm-admins` });

  if (role === null) return;

  const roleMapping: RoleMappingPayload = { id: role?.id as string, name: role?.name as string };

  const delRoleMappingPromises = userIds.map((id) =>
    kcAdminClient.users.delRealmRoleMappings({
      realm: 'master',
      id: id,
      roles: [roleMapping],
    }),
  );
  return Promise.all(delRoleMappingPromises);
};

export const addUserAsRealmAdmin = async (username: string, envs: string[], realmName: string) => {
  for (const env of envs) {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    let idirRealmUser;
    let masterRealmUser;
    let createFederatedIdentityLink = true;
    const [userGuid, userIdp] = username.toLowerCase().split('@');

    let idirRealmUsers = await kcAdminClient.users.find({
      realm: userIdp,
      username: userGuid,
      max: 1,
    });

    if (idirRealmUsers.length === 0) {
      // create user in realm
      idirRealmUser = await kcAdminClient.users.create({
        realm: userIdp,
        username,
        emailVerified: true,
        enabled: true,
      });

      // assign federated links to user
      await kcAdminClient.users.addToFederatedIdentity({
        realm: userIdp,
        id: idirRealmUser.id!,
        federatedIdentityId: userIdp,
        federatedIdentity: {
          userId: userGuid.toUpperCase(),
          userName: userGuid,
          identityProvider: userIdp,
        },
      });
    } else {
      idirRealmUser = idirRealmUsers[0];
    }

    const masterRealmUsers = await kcAdminClient.users.find({
      realm: 'master',
      username: username,
      max: 1,
    });

    if (masterRealmUsers.length === 0) {
      // create user in master realm
      masterRealmUser = await kcAdminClient.users.create({
        realm: 'master',
        username: username,
        emailVerified: true,
        enabled: true,
      });

      // assign federated links to user for idp
      await kcAdminClient.users.addToFederatedIdentity({
        realm: 'master',
        id: masterRealmUser.id!,
        federatedIdentityId: 'idir',
        federatedIdentity: {
          userId: idirRealmUser.id,
          userName: userGuid,
          identityProvider: 'idir',
        },
      });
    } else {
      masterRealmUser = masterRealmUsers[0];
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
