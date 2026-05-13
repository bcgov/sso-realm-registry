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
