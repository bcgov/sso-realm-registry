import KeycloakCore from 'utils/keycloak-core';
import { getRealmPermissionsByRole } from 'utils/helpers';
import RoleRepresentation, { RoleMappingPayload } from '@keycloak/keycloak-admin-client/lib/defs/roleRepresentation';
import ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation';
import GroupRepresentation from '@keycloak/keycloak-admin-client/lib/defs/groupRepresentation';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { app_env } = serverRuntimeConfig;

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

  const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name: `${realm}-realm-admin` });

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
  try {
    for (const env of envs) {
      const kcCore = new KeycloakCore(env);
      const kcAdminClient = await kcCore.getAdminClient();
      let idirRealmUser;
      let masterRealmUser;
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
          username: userGuid,
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
            userName: userGuid.toUpperCase(),
            identityProvider: userIdp,
          },
        });
      } else {
        idirRealmUser = idirRealmUsers[0];
      }

      const masterRealmUsers = await kcAdminClient.users.find({
        realm: 'master',
        username,
        max: 1,
      });

      if (masterRealmUsers.length === 0) {
        // create user in master realm
        masterRealmUser = await kcAdminClient.users.create({
          realm: 'master',
          username,
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
  } catch (err) {
    console.error(err);
  }
};

export const createCustomRealm = async (realmName: string, env: string) => {
  try {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const realm = await kcAdminClient.realms.findOne({ realm: realmName });
    if (realm === null) {
      // create custom realm
      const realm = await kcAdminClient.realms.create({
        realm: realmName,
        enabled: true,
      });
      if (realm) {
        // fetch created custom realm
        const customRealm = await kcAdminClient.realms.findOne({ realm: realmName });
        if (customRealm) {
          const composites = await kcAdminClient.roles.getCompositeRoles({
            realm: realmName,
            id: customRealm.defaultRole!.id!,
          });

          const manageAccountRole = composites.find((role) => role.name === 'manage-account');
          await kcAdminClient.roles.delCompositeRoles(
            {
              id: customRealm.defaultRole!.id!,
              realm: realmName,
            },
            [
              {
                id: manageAccountRole!.id,
              },
            ],
          );

          const permissionByRoles = getRealmPermissionsByRole(customRealm.realm as string);

          for (const role of permissionByRoles) {
            // fetch realm management client
            const grantingClient = await kcAdminClient.clients.find({
              realm: role.realmName,
              clientId: role.clientId,
            });

            const grantingClientRoles = await kcAdminClient.clients.listRoles({
              realm: role.realmName,
              id: grantingClient[0].id as string,
            });

            const customRealmRole = await createRealmRole(
              role.name,
              env,
              role.realmName,
              grantingClientRoles.filter((clientRole: RoleRepresentation) =>
                role.permissions.includes(clientRole.name as string),
              ),
            );

            // create a service account that has a role in custom realm
            await createOpenIdClient(role.realmName, env, {
              clientId: `${role.name}-cli`,
              name: `${role.name}-cli`,
              enabled: true,
              clientAuthenticatorType: 'client-secret',
              protocol: 'openid-connect',
              publicClient: false,
              directAccessGrantsEnabled: false,
              serviceAccountsEnabled: true,
              standardFlowEnabled: false,
              implicitFlowEnabled: false,
            });

            const customRealmCliClient = await kcAdminClient.clients.find({
              realm: role.realmName,
              clientId: `${role.name}-cli`,
            });

            const customRealmAdminCliClientUser = await kcAdminClient.clients.getServiceAccountUser({
              realm: role.realmName,
              id: customRealmCliClient[0].id as string,
            });

            if (customRealmRole && customRealmAdminCliClientUser) {
              await kcAdminClient.users.addRealmRoleMappings({
                id: customRealmAdminCliClientUser.id as string,
                realm: role.realmName,
                roles: [
                  {
                    id: customRealmRole.id as string,
                    name: customRealmRole.name as string,
                  },
                ],
              });

              // create group and assign roles
              await createRealmGroup(role.group, env, role.realmName, [
                {
                  id: customRealmRole.id as string,
                  name: customRealmRole.name as string,
                },
              ]);
            }
          }

          return customRealm;
        }
      } else throw Error('Failed to find custom realm');
    }
  } catch (err) {
    console.error(err);
    throw Error('Failed to create custom realm and its master realm resources');
  }
};

export const deleteCustomRealm = async (realmName: string, env: string) => {
  try {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const realm = await kcAdminClient.realms.findOne({ realm: realmName });

    if (realm) {
      // delete custom realm
      await kcAdminClient.realms.del({
        realm: realm.realm as string,
      });
    }
    const masterRealmResources = getRealmPermissionsByRole(realmName as string).find(
      (role) => role.realmName === 'master',
    );

    if (masterRealmResources) {
      const masterRealmCliClients = await kcAdminClient.clients.find({
        realm: masterRealmResources.realmName,
        clientId: `${masterRealmResources.name}-cli`,
      });

      const masterRealmCliClientExists = masterRealmCliClients.find(
        (client: ClientRepresentation) => client.clientId === `${masterRealmResources.name}-cli`,
      );

      if (masterRealmCliClientExists)
        await kcAdminClient.clients.del({
          realm: masterRealmResources.realmName,
          id: masterRealmCliClientExists.id as string,
        });

      const masterRealmGroups = await kcAdminClient.groups.find({
        realm: masterRealmResources.realmName,
      });

      const masterRealmGroupExists = masterRealmGroups.find(
        (group: GroupRepresentation) => group.name === masterRealmResources.group,
      );
      if (masterRealmGroupExists)
        await kcAdminClient.groups.del({
          realm: masterRealmResources.realmName,
          id: masterRealmGroupExists.id as string,
        });

      const masterRealmRole = await kcAdminClient.roles.find({
        realm: masterRealmResources.realmName,
      });
      const masterRealmRoleExists = masterRealmRole.find(
        (role: RoleRepresentation) => role.name === masterRealmResources.name,
      );
      if (masterRealmRoleExists)
        await kcAdminClient.roles.delById({
          realm: masterRealmResources.realmName,
          id: masterRealmRoleExists.id as string,
        });
    }
  } catch (err) {
    console.error(err);
    throw Error('Failed to delete custom realm and its master realm resources');
  }
};

export const manageCustomRealm = async (realmName: string, envs: string[], action: 'create' | 'delete' | 'restore') => {
  try {
    for (const env of envs) {
      const kcCore = new KeycloakCore(env);
      const kcAdminClient = await kcCore.getAdminClient();
      const realm = await kcAdminClient.realms.findOne({ realm: realmName });

      switch (action) {
        case 'create':
          if (!realm) await createCustomRealm(realmName, env);
          break;
        case 'delete':
          if (realm) {
            if (app_env === 'production') {
              if (realm.enabled) await kcAdminClient.realms.update({ realm: realmName }, { enabled: false });
            } else await deleteCustomRealm(realmName, env);
          }
          break;
        case 'restore':
          if (app_env === 'production' && realm && realm.enabled === false) {
            await kcAdminClient.realms.update({ realm: realmName }, { enabled: true });
          } else {
            if (!realm) await createCustomRealm(realmName, env);
          }
          break;
        default:
          throw Error(`Invalid action: ${action}`);
      }
    }
  } catch (err) {
    console.error(err);
    throw Error(`Failed to ${action} custom realm at this time`);
  }
};

const createOpenIdClient = async (
  realmName: string,
  env: string,
  clientConfig: ClientRepresentation,
): Promise<void> => {
  try {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const realm = await kcAdminClient.realms.findOne({ realm: realmName });
    if (realm) {
      const openidClient = await kcAdminClient.clients.findOne({
        realm: realmName,
        id: clientConfig.clientId as string,
      });

      if (openidClient) {
        const updatedConfig = Object.assign(openidClient, clientConfig);
        await kcAdminClient.clients.update(
          {
            realm: realmName,
            id: clientConfig.clientId as string,
          },
          {
            ...updatedConfig,
          },
        );
      } else {
        await kcAdminClient.clients.create({
          realm: realmName,
          enabled: true,
          ...clientConfig,
        });
      }
    } else console.error(`Failed to find realm: ${realmName}`);
  } catch (err) {
    console.error(err);
    throw Error(`Failed to create openid client: ${clientConfig.clientId}`);
  }
};

const createGroup = async (
  realmName: string,
  env: string,
  groupName: string,
): Promise<GroupRepresentation | undefined> => {
  const kcCore = new KeycloakCore(env);
  const kcAdminClient = await kcCore.getAdminClient();
  const groups = await kcAdminClient.groups.find({
    realm: realmName,
    search: groupName,
  });
  if (groups.length === 0) {
    const groupId = await kcAdminClient.groups.create({
      realm: realmName,
      name: groupName,
    });
    return await kcAdminClient.groups.findOne({ realm: realmName, id: groupId.id });
  }
  return groups[0];
};

const createRealmRole = async (
  roleName: string,
  env: string,
  realmName: string,
  compositeRoles: RoleRepresentation[] = [],
): Promise<RoleRepresentation | undefined> => {
  try {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const created = await kcAdminClient.roles.create({
      realm: realmName,
      name: roleName,
    });

    const role = await kcAdminClient.roles.findOneByName({ realm: realmName, name: created.roleName });

    if (role && compositeRoles.length > 0) {
      await kcAdminClient.roles.createComposite(
        {
          realm: realmName,
          roleId: role.id as string,
        },
        compositeRoles,
      );
    }
    return role;
  } catch (err) {
    console.error(err);
    throw Error(`Failed to create realm role: ${roleName}`);
  }
};

const createRealmGroup = async (
  groupName: string,
  env: string,
  realmName: string,
  roles: RoleMappingPayload[] = [],
): Promise<GroupRepresentation | undefined> => {
  try {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const group = await createGroup(realmName, env, groupName);
    if (group && roles.length > 0) {
      await kcAdminClient.groups.addRealmRoleMappings({
        id: group.id as string,
        realm: realmName,
        roles,
      });
    }

    return group;
  } catch (err) {
    console.error(err);
    throw Error(`Failed to create group: ${groupName}`);
  }
};
