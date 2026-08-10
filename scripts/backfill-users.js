/**
 * Populates `users` and `users_rosters` from the flat contact columns on `rosters`, then
 * reconciles the resulting membership into Keycloak so every provisioned realm ends up
 * with the matching realm-admin group access in dev/test/prod.
 *
 * Idempotent and re-runnable: it upserts users and only inserts membership that is not
 * already there, so a partial run can simply be repeated. The Keycloak side is likewise
 * safe to re-run: only memberships with `synced_at IS NULL` are (re)synced, and each
 * environment call is idempotent (mirrors `syncUserAccess` in `app/controllers/keycloak.ts`).
 * The number of contacts that no longer resolve in the directory is not known in advance,
 * so it prints a summary report rather than assuming a clean run.
 *
 * Run `node backfill-users.js --dry-run` to report without writing.
 * Run `node backfill-users.js --skip-access-sync` to backfill the database only, without
 * touching Keycloak.
 */
import { ConfidentialClientApplication } from '@azure/msal-node';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_ACCESS_SYNC = process.argv.includes('--skip-access-sync');

/** Slot mapping from the retired flat columns to a membership role. */
const SLOTS = [
  { emailColumn: 'product_owner_email', usernameColumn: 'product_owner_idir_userid', role: 'product_owner' },
  { emailColumn: 'technical_contact_email', usernameColumn: 'technical_contact_idir_userid', role: 'technical_lead' },
  {
    emailColumn: 'second_technical_contact_email',
    usernameColumn: 'second_technical_contact_idir_userid',
    role: 'additional',
  },
];

const report = {
  rostersProcessed: 0,
  usersCreated: 0,
  usersUpdated: 0,
  membershipsCreated: 0,
  membershipsAlreadyPresent: 0,
  unresolvedContacts: [],
  duplicateSlotsSkipped: [],
  emptySlots: 0,
  errors: [],
  accessSynced: 0,
  accessSyncSkipped: 0,
  accessSyncFailures: [],
};

let msalInstance;

const getAccessToken = async () => {
  if (!msalInstance) {
    msalInstance = new ConfidentialClientApplication({
      auth: {
        authority: process.env.MS_GRAPH_API_AUTHORITY || '',
        clientId: process.env.MS_GRAPH_API_CLIENT_ID || '',
        clientSecret: process.env.MS_GRAPH_API_CLIENT_SECRET || '',
      },
    });
  }

  const response = await msalInstance.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return response?.accessToken;
};

const graphCache = new Map();

/**
 * Looks a contact up by their IDIR username. Returns null when the account no longer
 * exists, which is expected for historical contacts and is not an error.
 */
const fetchDirectoryUser = async (idirUsername) => {
  const key = idirUsername.toLowerCase();
  if (graphCache.has(key)) return graphCache.get(key);

  const url = new URL('https://graph.microsoft.com/v1.0/users');
  url.searchParams.set('$filter', `mailNickname eq '${idirUsername.replace(/'/g, "''")}'`);
  url.searchParams.set(
    '$select',
    'id,onPremisesExtensionAttributes,onPremisesSamAccountName,mailNickname,mail,displayName',
  );

  let result = null;
  try {
    const accessToken = await getAccessToken();
    const response = await axios.get(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual' },
    });
    const value = response.data?.value?.[0];
    if (value) {
      result = {
        guid: value.onPremisesExtensionAttributes?.extensionAttribute12 ?? null,
        idirUsername: value.onPremisesSamAccountName || value.mailNickname || idirUsername,
        email: value.mail ?? null,
        displayName: value.displayName ?? null,
      };
    }
  } catch (err) {
    report.errors.push(`Graph lookup failed for ${idirUsername}: ${err.message}`);
  }

  graphCache.set(key, result);
  return result;
};

/**
 * Upserts the `users` row. Contacts that do not resolve keep a NULL guid and a NULL
 * resolved_at, preserving the historical record; those rows are excluded from every sync
 * and surface as a count on the admin dashboard.
 */
const upsertUser = async (client, idirUsername, fallbackEmail) => {
  const directoryUser = await fetchDirectoryUser(idirUsername);

  if (!directoryUser || !directoryUser.guid) {
    report.unresolvedContacts.push(idirUsername);
  }

  const guid = directoryUser?.guid ?? null;
  const username = directoryUser?.idirUsername ?? idirUsername;
  const email = directoryUser?.email ?? fallbackEmail ?? null;
  const displayName = directoryUser?.displayName ?? null;
  const resolvedAt = directoryUser ? new Date() : null;

  if (DRY_RUN) return { id: null, created: true };

  // Match on guid first, then on the username, so an unresolved row backfilled by an
  // earlier run is upgraded in place instead of colliding with the username index.
  const byGuid = guid ? await client.query('SELECT id FROM users WHERE guid = $1', [guid]) : { rows: [] };
  const existing = byGuid.rows.length
    ? byGuid
    : await client.query('SELECT id FROM users WHERE LOWER(idir_username) = LOWER($1)', [username]);

  if (existing.rows.length) {
    const { id } = existing.rows[0];
    await client.query(
      `UPDATE users
       SET guid = COALESCE($2, guid),
           idir_username = $3,
           email = COALESCE($4, email),
           display_name = COALESCE($5, display_name),
           resolved_at = COALESCE($6, resolved_at),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, guid, username, email, displayName, resolvedAt],
    );
    report.usersUpdated += 1;
    return { id, created: false };
  }

  const inserted = await client.query(
    `INSERT INTO users (guid, idir_username, email, display_name, resolved_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [guid, username, email, displayName, resolvedAt],
  );
  report.usersCreated += 1;
  return { id: inserted.rows[0].id, created: true };
};

const linkMembership = async (client, rosterId, userId, role) => {
  if (DRY_RUN) return;

  const existing = await client.query(
    'SELECT id FROM users_rosters WHERE roster_id = $1 AND user_id = $2 AND removed_at IS NULL',
    [rosterId, userId],
  );

  if (existing.rows.length) {
    report.membershipsAlreadyPresent += 1;
    return;
  }

  await client.query('INSERT INTO users_rosters (roster_id, user_id, role) VALUES ($1, $2, $3)', [
    rosterId,
    userId,
    role,
  ]);
  report.membershipsCreated += 1;
};

/** A realm only exists in Keycloak once it has been approved and applied. Mirrors
 * `isRealmProvisioned` in `app/controllers/user-access.ts`. */
const isRealmProvisioned = (roster) =>
  Boolean(roster.realm) && roster.approved === true && roster.status === 'applied' && !roster.archived;

const kcAdminClients = new Map();

/** Authenticates against a single environment's master realm, caching the client. */
const getKcAdminClient = async (env) => {
  if (kcAdminClients.has(env)) return kcAdminClients.get(env);

  const kcAdminClient = new KcAdminClient({
    baseUrl: `${process.env[`${env.toUpperCase()}_KC_URL`]}/auth`,
    realmName: 'master',
  });

  await kcAdminClient.auth({
    grantType: 'password',
    clientId: 'admin-cli',
    username: process.env[`${env.toUpperCase()}_KC_USERNAME`],
    password: process.env[`${env.toUpperCase()}_KC_PASSWORD`],
  });

  kcAdminClients.set(env, kcAdminClient);
  return kcAdminClient;
};

const masterUsernameForGuid = (guid) => `${guid.toLowerCase()}@azureidir`;

/**
 * Finds the master realm user for a guid, creating it (and its federated identity link,
 * in both the idp realm and master) if it does not exist yet.
 */
const ensureMasterRealmUser = async (kcAdminClient, username) => {
  const [userGuid, userIdp] = username.toLowerCase().split('@');

  const idpRealmUsers = await kcAdminClient.users.find({ realm: userIdp, username: userGuid, max: 1 });

  if (idpRealmUsers.length === 0) {
    const idpRealmUser = await kcAdminClient.users.create({ realm: userIdp, username: userGuid, enabled: true });

    await kcAdminClient.users.addToFederatedIdentity({
      realm: userIdp,
      id: idpRealmUser.id,
      federatedIdentityId: userIdp,
      federatedIdentity: { userId: userGuid, userName: userGuid, identityProvider: userIdp },
    });
  }

  const masterRealmUsers = await kcAdminClient.users.find({ realm: 'master', username, max: 1 });
  if (masterRealmUsers.length > 0) return masterRealmUsers[0];

  const masterRealmUser = await kcAdminClient.users.create({ realm: 'master', username, enabled: true });

  await kcAdminClient.users.addToFederatedIdentity({
    realm: 'master',
    id: masterRealmUser.id,
    federatedIdentityId: 'azureidir',
    federatedIdentity: { userId: userGuid, userName: userGuid, identityProvider: 'azureidir' },
  });

  return kcAdminClient.users.findOne({ realm: 'master', id: masterRealmUser.id });
};

/**
 * Finds the `<realm> Realm Administrator` group in master, creating it and mapping the
 * realm admin role if it is missing.
 */
const ensureMasterRealmAdminGroup = async (kcAdminClient, realmName, role) => {
  const groupName = `${realmName} Realm Administrator`;
  const groups = await kcAdminClient.groups.find({ realm: 'master', search: groupName });
  const group = groups.find((g) => g.name === groupName);
  if (group) return group;

  const created = await kcAdminClient.groups.create({ realm: 'master', name: groupName });
  await kcAdminClient.groups.addRealmRoleMappings({
    realm: 'master',
    id: created.id,
    roles: [{ id: role.id, name: role.name }],
  });

  return kcAdminClient.groups.findOne({ realm: 'master', id: created.id });
};

/**
 * Grants master realm administrator access for a single user in a single environment via
 * the realm's master group. Mirrors `syncUserAccess` (action: 'add') in
 * `app/controllers/keycloak.ts`; only additions are needed here since the backfill never
 * removes membership.
 */
const syncUserAccess = async (kcAdminClient, realmName, guid) => {
  const username = masterUsernameForGuid(guid);

  const role = await kcAdminClient.roles.findOneByName({ realm: 'master', name: `${realmName}-realm-admin` });
  if (!role) throw new Error(`Realm ${realmName} has no ${realmName}-realm-admin role`);

  const group = await ensureMasterRealmAdminGroup(kcAdminClient, realmName, role);
  if (!group?.id) throw new Error(`Unable to resolve the realm administrator group for ${realmName}`);

  const masterRealmUser = await ensureMasterRealmUser(kcAdminClient, username);
  if (!masterRealmUser?.id) throw new Error(`Unable to resolve the master realm user ${username}`);

  await kcAdminClient.users.addToGroup({ realm: 'master', id: masterRealmUser.id, groupId: group.id });
};

/**
 * Reconciles membership just written for one roster into Keycloak. Only memberships
 * with `synced_at IS NULL` are attempted, so a repeated run only retries what previously
 * failed or is new. `synced_at` is only stamped once every one of the realm's
 * environments has succeeded, matching the manual sync button's semantics.
 */
const syncRosterAccess = async (client, roster) => {
  if (!isRealmProvisioned(roster)) return;

  const envs = roster.environments ?? [];
  if (envs.length === 0) return;

  const { rows: pending } = await client.query(
    `SELECT ur.id, u.guid, u.idir_username
     FROM users_rosters ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.roster_id = $1 AND ur.removed_at IS NULL AND ur.synced_at IS NULL AND u.guid IS NOT NULL`,
    [roster.id],
  );

  for (const member of pending) {
    const failures = [];

    for (const env of envs) {
      try {
        const kcAdminClient = await getKcAdminClient(env);
        await syncUserAccess(kcAdminClient, roster.realm, member.guid);
      } catch (err) {
        failures.push(`${env}: ${err.message}`);
      }
    }

    if (failures.length > 0) {
      report.accessSyncFailures.push(`${roster.realm} / ${member.idir_username}: ${failures.join('; ')}`);
      continue;
    }

    await client.query(
      'UPDATE users_rosters SET synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [member.id],
    );
    report.accessSynced += 1;
  }
};

const processRoster = async (client, roster) => {
  // Nothing prevented one person from filling two slots. Membership is unique per user
  // per roster, so keep the highest role by precedence and skip the duplicate. A roster
  // can therefore emerge with no technical lead; the next person to edit it is forced to
  // fill the slot. That is accepted friction on legacy data.
  const seenUserIds = new Set();

  for (const slot of SLOTS) {
    const idirUsername = roster[slot.usernameColumn];
    if (!idirUsername || !String(idirUsername).trim()) {
      report.emptySlots += 1;
      continue;
    }

    try {
      const { id: userId } = await upsertUser(client, String(idirUsername).trim(), roster[slot.emailColumn]);
      if (userId === null) continue; // dry run

      if (seenUserIds.has(userId)) {
        report.duplicateSlotsSkipped.push(`${roster.realm}: ${idirUsername} already held a higher role`);
        continue;
      }
      seenUserIds.add(userId);

      await linkMembership(client, roster.id, userId, slot.role);
    } catch (err) {
      report.errors.push(`${roster.realm} / ${slot.role} (${idirUsername}): ${err.message}`);
    }
  }

  report.rostersProcessed += 1;

  if (DRY_RUN || SKIP_ACCESS_SYNC) {
    if (SKIP_ACCESS_SYNC && !DRY_RUN) report.accessSyncSkipped += 1;
    return;
  }

  try {
    await syncRosterAccess(client, roster);
  } catch (err) {
    report.errors.push(`${roster.realm} / access sync: ${err.message}`);
  }
};

const printReport = () => {
  const unresolved = Array.from(new Set(report.unresolvedContacts));

  console.log('\n=== Backfill summary ===');
  if (DRY_RUN) console.log('(dry run: nothing was written)');
  console.log(`Rosters processed:            ${report.rostersProcessed}`);
  console.log(`Users created:                ${report.usersCreated}`);
  console.log(`Users updated:                ${report.usersUpdated}`);
  console.log(`Memberships created:          ${report.membershipsCreated}`);
  console.log(`Memberships already present:  ${report.membershipsAlreadyPresent}`);
  console.log(`Empty contact slots:          ${report.emptySlots}`);
  console.log(`Unresolvable contacts:        ${unresolved.length}`);
  unresolved.forEach((username) => console.log(`  - ${username}`));
  console.log(`Duplicate slots skipped:      ${report.duplicateSlotsSkipped.length}`);
  report.duplicateSlotsSkipped.forEach((detail) => console.log(`  - ${detail}`));
  if (SKIP_ACCESS_SYNC && !DRY_RUN) {
    console.log(`Access sync skipped (rosters): ${report.accessSyncSkipped} (--skip-access-sync)`);
  } else {
    console.log(`Access synced to Keycloak:    ${report.accessSynced}`);
    console.log(`Access sync failures:         ${report.accessSyncFailures.length}`);
    report.accessSyncFailures.forEach((detail) => console.log(`  - ${detail}`));
  }
  console.log(`Errors:                       ${report.errors.length}`);
  report.errors.forEach((detail) => console.log(`  - ${detail}`));
};

const backfill = async () => {
  const client = new pg.Client({
    host: process.env.PG_HOST,
    port: Number.parseInt(process.env.PG_PORT ?? '5432', 10),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ...(process.env.PG_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, realm, approved, status, archived, environments,
              product_owner_email, product_owner_idir_userid,
              technical_contact_email, technical_contact_idir_userid,
              second_technical_contact_email, second_technical_contact_idir_userid
       FROM rosters
       ORDER BY id ASC`,
    );

    for (const roster of rows) {
      await processRoster(client, roster);
    }
  } finally {
    await client.end();
    printReport();
  }
};

backfill().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
