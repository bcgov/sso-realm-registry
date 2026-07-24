import KcAdminClient from '@keycloak/keycloak-admin-client';
import KeycloakCore from 'utils/keycloak-core';
import { getRealmPermissionsByRole } from 'utils/helpers';
import RoleRepresentation, { RoleMappingPayload } from '@keycloak/keycloak-admin-client/lib/defs/roleRepresentation';
import ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation';
import GroupRepresentation from '@keycloak/keycloak-admin-client/lib/defs/groupRepresentation';

export const AZURE_IDIR_IDP = 'azureidir';

/**
 * Master realm username for an IDIR guid. Realm admin access is only ever granted
 * to `@azureidir` identities; `@idir` identities are out of scope.
 */
export const buildMasterUsername = (guid: string) => `${guid.toLowerCase()}@${AZURE_IDIR_IDP}`;

/**
 * The master realm role and group that grant administration of a custom realm.
 */
const getMasterRealmAdminResources = (realmName: string) => {
  const resources = getRealmPermissionsByRole(realmName).find((role) => role.realmName === 'master');
  if (!resources) throw new Error(`Failed to resolve master realm resources for realm: ${realmName}`);
  return resources;
};

const findMasterRealmAdminRole = async (kcAdminClient: KcAdminClient, realmName: string) => {
  const { name } = getMasterRealmAdminResources(realmName);
  const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name });
  if (!role) throw new Error(`Failed to find master realm role: ${name}`);
  return role;
};

/**
 * Finds the master realm group that grants administration of a custom realm, creating it
 * with its role mapping if missing.
 */
export const ensureMasterRealmAdminGroup = async (env: string, realmName: string) => {
  const kcCore = new KeycloakCore(env);
  const kcAdminClient = await kcCore.getAdminClient();
  const role = await findMasterRealmAdminRole(kcAdminClient, realmName);

  const group = await createRealmGroup(getMasterRealmAdminResources(realmName).group, env, 'master', [
    { id: role.id as string, name: role.name as string },
  ]);

  if (!group) throw new Error(`Failed to find or create master group for realm: ${realmName}`);
  return group;
};

const findMasterRealmAdminGroup = async (kcAdminClient: KcAdminClient, realmName: string) => {
  const { group: groupName } = getMasterRealmAdminResources(realmName);
  // `search` is a substring match, so narrow the result set and then match the name exactly
  const groups = await kcAdminClient.groups.find({ realm: 'master', search: groupName });
  return groups.find((group) => group.name === groupName) ?? null;
};

const findMasterRealmUser = async (kcAdminClient: KcAdminClient, username: string) => {
  const users = await kcAdminClient.users.find({ realm: 'master', username, exact: true, max: 1 });
  return users[0] ?? null;
};

/**
 * Strips the direct `<realmname>-realm-admin` role mapping from a master realm user. Access is
 * granted through the realm's master group, so any direct mapping is a legacy assignment.
 */
const stripDirectRoleMapping = async (kcAdminClient: KcAdminClient, userId: string, realmName: string) => {
  const role = await findMasterRealmAdminRole(kcAdminClient, realmName);
  const roleMapping: RoleMappingPayload = { id: role.id as string, name: role.name as string };
  await kcAdminClient.users.delRealmRoleMappings({ realm: 'master', id: userId, roles: [roleMapping] });
};

/**
 * Grants master realm administration of a custom realm by adding the user to the realm's master
 * group, creating the `azureidir` and master realm users if they do not exist yet. Any legacy
 * direct role mapping is stripped so that group membership is the only source of the access.
 * @param username Master realm username, of the form `<guid>@azureidir`
 * @param envs The environments to grant access in
 * @param realmName The realm name to grant access to
 */
export const addUserAsRealmAdmin = async (username: string, envs: string[], realmName: string) => {
  for (const env of envs) {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    let masterRealmUser;
    const [userGuid, userIdp] = username.toLowerCase().split('@');

    let azureidirRealmUsers = await kcAdminClient.users.find({
      realm: userIdp,
      username: userGuid,
      max: 1,
    });

    if (azureidirRealmUsers.length === 0) {
      // create user in realm
      const azureidirRealmUser = await kcAdminClient.users.create({
        realm: userIdp,
        username: userGuid,
        enabled: true,
      });

      // assign federated links to user
      await kcAdminClient.users.addToFederatedIdentity({
        realm: userIdp,
        id: azureidirRealmUser.id,
        federatedIdentityId: userIdp,
        federatedIdentity: {
          userId: userGuid.toLowerCase(), // after user gets logged in it gets updated to actual sub from entra by keycloak authenticator
          userName: userGuid.toLowerCase(),
          identityProvider: userIdp,
        },
      });
    }

    const existingMasterRealmUser = await findMasterRealmUser(kcAdminClient, username);

    if (!existingMasterRealmUser) {
      // create user in master realm
      masterRealmUser = await kcAdminClient.users.create({
        realm: 'master',
        username,
        enabled: true,
      });

      // assign federated links to user for idp
      await kcAdminClient.users.addToFederatedIdentity({
        realm: 'master',
        id: masterRealmUser.id,
        federatedIdentityId: AZURE_IDIR_IDP,
        federatedIdentity: {
          userId: userGuid,
          userName: userGuid,
          identityProvider: AZURE_IDIR_IDP,
        },
      });
    } else {
      masterRealmUser = existingMasterRealmUser;
    }

    const group = await ensureMasterRealmAdminGroup(env, realmName);

    await kcAdminClient.users.addToGroup({
      realm: 'master',
      id: masterRealmUser.id as string,
      groupId: group.id as string,
    });

    await stripDirectRoleMapping(kcAdminClient, masterRealmUser.id as string, realmName);
  }
};

/**
 * Revokes master realm administration of a custom realm. Removes the users from the realm's
 * master group and strips any direct `<realmname>-realm-admin` mapping left over from a manual
 * assignment.
 * @param guids IDIR guids to revoke access from
 * @param envs The environments to revoke access in
 * @param realmName The realm name to revoke access to
 */
export const removeUserAsRealmAdmin = async (guids: (string | null)[], envs: string[], realmName: string) => {
  const usernames = (guids.filter(Boolean) as string[]).map(buildMasterUsername);
  if (usernames.length === 0) return;

  for (const env of envs) {
    const kcCore = new KeycloakCore(env);
    const kcAdminClient = await kcCore.getAdminClient();
    const group = await findMasterRealmAdminGroup(kcAdminClient, realmName);

    for (const username of usernames) {
      const masterRealmUser = await findMasterRealmUser(kcAdminClient, username);

      if (!masterRealmUser) {
        console.info(`No master realm user ${username} found as admin for realm ${realmName} in ${env}.`);
        continue;
      }

      if (group) {
        await kcAdminClient.users.delFromGroup({
          realm: 'master',
          id: masterRealmUser.id as string,
          groupId: group.id as string,
        });
      }

      await stripDirectRoleMapping(kcAdminClient, masterRealmUser.id as string, realmName);
    }
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
      } else throw new Error('Failed to find custom realm');
    }
  } catch (err) {
    console.error(err);
    throw new Error('Failed to create custom realm and its master realm resources');
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
    const masterRealmResources = getRealmPermissionsByRole(realmName).find((role) => role.realmName === 'master');

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
    throw new Error('Failed to delete custom realm and its master realm resources');
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
          if (realm?.enabled) {
            await kcAdminClient.realms.update({ realm: realmName }, { enabled: false });
          }
          break;
        case 'restore':
          if (process.env.APP_ENV === 'production' && realm?.enabled === false) {
            await kcAdminClient.realms.update({ realm: realmName }, { enabled: true });
          } else if (!realm) await createCustomRealm(realmName, env);
          break;
        default:
          throw new Error(`Invalid action: ${action}`);
      }
    }
  } catch (err) {
    console.error(err);
    throw new Error(`Failed to ${action} custom realm at this time`);
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
    throw new Error(`Failed to create openid client: ${clientConfig.clientId}`);
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
  // `search` is a substring match, so `foo Realm Administrator` also matches `foo-bar Realm Administrator`
  const group = groups.find((group) => group.name === groupName);
  if (!group) {
    const groupId = await kcAdminClient.groups.create({
      realm: realmName,
      name: groupName,
    });
    return await kcAdminClient.groups.findOne({ realm: realmName, id: groupId.id });
  }
  return group;
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
    throw new Error(`Failed to create realm role: ${roleName}`);
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
    throw new Error(`Failed to create group: ${groupName}`);
  }
};
