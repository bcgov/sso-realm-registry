import KcAdminClient from '@keycloak/keycloak-admin-client';
import KeycloakCore from 'utils/keycloak-core';
import { getRealmPermissionsByRole } from 'utils/helpers';
import RoleRepresentation, { RoleMappingPayload } from '@keycloak/keycloak-admin-client/lib/defs/roleRepresentation';
import ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation';
import GroupRepresentation from '@keycloak/keycloak-admin-client/lib/defs/groupRepresentation';

/**
 * Master realm username for an IDIR guid. This is the direct provisioning key for
 * realm admin access, which is why the guid is only ever taken from Graph.
 */
export const masterUsernameForGuid = (guid: string) => `${guid.toLowerCase()}@azureidir`;

/**
 * Finds the master realm user for a guid, creating it (and its federated identity
 * link, in both the idp realm and master) if it does not exist yet.
 */
const ensureMasterRealmUser = async (kcAdminClient: KcAdminClient, username: string) => {
  const [userGuid, userIdp] = username.toLowerCase().split('@');

  const idpRealmUsers = await kcAdminClient.users.find({
    realm: userIdp,
    username: userGuid,
    max: 1,
  });

  if (idpRealmUsers.length === 0) {
    const idpRealmUser = await kcAdminClient.users.create({
      realm: userIdp,
      username: userGuid,
      enabled: true,
    });

    await kcAdminClient.users.addToFederatedIdentity({
      realm: userIdp,
      id: idpRealmUser.id,
      federatedIdentityId: userIdp,
      federatedIdentity: {
        userId: userGuid, // after user gets logged in it gets updated to actual sub from entra by keycloak authenticator
        userName: userGuid,
        identityProvider: userIdp,
      },
    });
  }

  const masterRealmUsers = await kcAdminClient.users.find({
    realm: 'master',
    username,
    max: 1,
  });

  if (masterRealmUsers.length > 0) return masterRealmUsers[0];

  const masterRealmUser = await kcAdminClient.users.create({
    realm: 'master',
    username,
    enabled: true,
  });

  await kcAdminClient.users.addToFederatedIdentity({
    realm: 'master',
    id: masterRealmUser.id,
    federatedIdentityId: 'azureidir',
    federatedIdentity: {
      userId: userGuid,
      userName: userGuid,
      identityProvider: 'azureidir',
    },
  });

  return await kcAdminClient.users.findOne({ realm: 'master', id: masterRealmUser.id });
};

const findMasterRealmUser = async (kcAdminClient: KcAdminClient, username: string) => {
  const users = await kcAdminClient.users.find({ realm: 'master', username, max: 1 });
  return users[0];
};

/**
 * Finds the `<realm> Realm Administrator` group in master, creating it and mapping
 * the realm admin role if it is missing. Realms provisioned by the retired terraform
 * path have the role but no group, and converge here the first time a membership changes.
 */
const ensureMasterRealmAdminGroup = async (
  kcAdminClient: KcAdminClient,
  realmName: string,
  role: RoleRepresentation,
) => {
  const groupName = `${realmName} Realm Administrator`;
  const groups = await kcAdminClient.groups.find({ realm: 'master', search: groupName });
  const group = groups.find((g: GroupRepresentation) => g.name === groupName);
  if (group) return group;

  const created = await kcAdminClient.groups.create({ realm: 'master', name: groupName });
  await kcAdminClient.groups.addRealmRoleMappings({
    realm: 'master',
    id: created.id,
    roles: [{ id: role.id as string, name: role.name as string }],
  });

  return await kcAdminClient.groups.findOne({ realm: 'master', id: created.id });
};

/**
 * Grants or withdraws master realm administrator access for a single user in a single
 * environment. Access is granted through the realm's master group; removals also strip
 * any direct role assignment, which is how historical manual grants drain toward group
 * membership over time.
 *
 * Idempotent: safe to re-run for an environment that already succeeded.
 */
export const syncUserAccess = async (realmName: string, env: string, guid: string, action: 'add' | 'remove') => {
  const kcCore = new KeycloakCore(env);
  const kcAdminClient = await kcCore.getAdminClient();
  const username = masterUsernameForGuid(guid);

  const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name: `${realmName}-realm-admin` });
  if (!role) throw new Error(`Realm ${realmName} has no ${realmName}-realm-admin role in ${env}`);

  const group = await ensureMasterRealmAdminGroup(kcAdminClient, realmName, role);
  if (!group?.id) throw new Error(`Unable to resolve the realm administrator group for ${realmName} in ${env}`);

  if (action === 'remove') {
    // Never create a user just to remove them; no account means nothing to withdraw.
    const masterRealmUser = await findMasterRealmUser(kcAdminClient, username);
    if (!masterRealmUser?.id) return;

    await kcAdminClient.users.delFromGroup({
      realm: 'master',
      id: masterRealmUser.id,
      groupId: group.id,
    });

    await kcAdminClient.users.delRealmRoleMappings({
      realm: 'master',
      id: masterRealmUser.id,
      roles: [{ id: role.id as string, name: role.name as string }],
    });
    return;
  }

  const masterRealmUser = await ensureMasterRealmUser(kcAdminClient, username);
  if (!masterRealmUser?.id) throw new Error(`Unable to resolve the master realm user ${username} in ${env}`);

  await kcAdminClient.users.addToGroup({
    realm: 'master',
    id: masterRealmUser.id,
    groupId: group.id,
  });
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
