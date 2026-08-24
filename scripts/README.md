# Scripts

## Realm Member Backfill (`backfill-users.js`)

Populates `users` and `users_rosters` from the flat contact columns on `rosters`, then
reconciles that membership into Keycloak (dev/test/prod) so every provisioned realm ends
up with the matching realm-admin group access — the same effect as pressing the manual
"sync" button for every realm. Run it once `helm/webapp/migration.sql` has created the
tables.

It is idempotent and re-runnable, so a partial run can simply be repeated: only
memberships with `synced_at IS NULL` are (re)synced to Keycloak, and each Keycloak call is
itself idempotent.

- Create `.env` from `env.example`
- Update the `PG_*`, `MS_GRAPH_API_*`, and `*_KC_*` values
- Run `cd scripts` from the root directory, then `yarn install`
- `node backfill-users.js --dry-run` reports what would happen without writing anything or
  contacting Keycloak
- `node backfill-users.js --skip-access-sync` backfills the database only, without
  touching Keycloak
- `node backfill-users.js` performs the backfill and the Keycloak access sync

The summary report lists contacts that no longer resolve in the directory. Those rows are
kept with a `NULL` guid so the historical record survives; they are excluded from every
access sync and are surfaced as a count on the admin dashboard. It also lists rosters
where one person filled two slots — the highest role by precedence
(`product_owner > technical_lead > additional`) is kept and the duplicate is skipped, so a
roster can emerge with no technical lead until someone next edits it. Any Keycloak access
sync failures are listed per realm/user/environment and can be retried by re-running the
script, or by using the app's manual sync button for that realm.

# User Realm Admin Permission Migration

## Data Preparation

- Run below query in grafana to populate realms data in json format
  ```sql
  SELECT json_agg(u) FROM (SELECT realm, product_owner_email, technical_contact_email, second_technical_contact_email FROM rosters) u;
  ```
- Copy the data to `./scripts/realm-users.json` in the root directory

## Run Script

- Create `.env` from `.env.example`
- Update all the `KC_*` values
- Run `cd scripts` from root directory and `node user-migration.js` to initiate the migration
