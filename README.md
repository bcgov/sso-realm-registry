# SSO Realm Registry

![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)

repository for SSO realm registry and helm chart

## Tech Stack

- [NextJS (ReactJS)](https://nextjs.org/): a React framework that gives you building blocks to create web applications.
- [Spilo](https://github.com/zalando/spilo): a Docker image that provides [PostgreSQL](https://www.postgresql.org/) and [Patroni](https://github.com/zalando/patroni) bundled together.

  - Postgres 14 and Patroni 2.1.3 are currently installed in OCP namespaces.

## Database Security

- We check PostgreSQL security vulnerabilities in supported versions and release history to mitigate the known issues and potential version deprecation:
  - see https://www.postgresql.org/support/versioning/
  - see https://www.postgresql.org/support/security/
- We check spilo release history to upgrade patroni version as needed:
  - see https://github.com/zalando/spilo/releases

## Database Backup & Recovery

- We runs daily database backups invoked by [WAL-G](https://github.com/wal-g/wal-g)'s PostgreSQL [continuous archiving](https://www.postgresql.org/docs/9.6/continuous-archiving.html) setup, which enables point-in-time recovery.

  ```yaml
  patroni:
    walG:
      enabled: true
      scheduleCronJob: 00 01 * * *
      retainBackups: 2
      pvc:
      size: 1Gi
  ```

- We store backups on Openshift PVC (netapp-file-backup), which is one of the supported `WAL-G` storage types.
  - https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md#file-system

### Recovery Process

- check if patroni cluster is healthy and running.

  ```sh
  $ patronictl list
  + Cluster: realm-registry (7106273589750788182) -----+---------+----+-----------+
  | Member                   | Host          | Role    | State   | TL | Lag in MB |
  +--------------------------+---------------+---------+---------+----+-----------+
  | realm-registry-patroni-0 | 10.97.122.229 | Replica | running |  6 |         0 |
  | realm-registry-patroni-1 | 10.97.121.116 | Leader  | running |  6 |           |
  +--------------------------+---------------+---------+---------+----+-----------+
  ```

- set the patroni cluster on maintenance mode.

  ```sh
  $ patronictl pause
  Success: cluster management is paused
  ```

- check if the patroni cluster is on maintenance mode.

  ```sh
  $ patronictl list
  + Cluster: realm-registry (7106273589750788182) -----+---------+----+-----------+
  | Member                   | Host          | Role    | State   | TL | Lag in MB |
  +--------------------------+---------------+---------+---------+----+-----------+
  | realm-registry-patroni-0 | 10.97.122.229 | Replica | running |  6 |         0 |
  | realm-registry-patroni-1 | 10.97.121.116 | Leader  | running |  6 |           |
  +--------------------------+---------------+---------+---------+----+-----------+
   Maintenance mode: on
  ```

- stop the postgres client in the leader pod.

  ```sh
  $ pg_ctl stop
  waiting for server to shut down..... done
  server stopped
  ```

- remove the current data directory.

  ```sh
  $ rm -rf "$PGDATA"
  ```

- restore the latest archived data.

  ```sh
  $ wal-g backup-fetch "$PGDATA" LATEST
  INFO: 2022/08/03 18:34:42.443396 Selecting the latest backup...
  INFO: 2022/08/03 18:34:43.023566 Finished extraction of part_003.tar.lz4
  INFO: 2022/08/03 18:34:43.024048 Finished decompression of part_003.tar.lz4
  INFO: 2022/08/03 18:34:46.741348 Finished extraction of part_001.tar.lz4
  INFO: 2022/08/03 18:34:46.741801 Finished decompression of part_001.tar.lz4
  INFO: 2022/08/03 18:34:46.749453 Finished extraction of pg_control.tar.lz4
  INFO: 2022/08/03 18:34:46.749835 Finished decompression of pg_control.tar.lz4
  INFO: 2022/08/03 18:34:46.749866
  Backup extraction complete.
  ```

- resume the patroni cluster

  ```sh
  $ patronictl resume
  Success: cluster management is resumed
  ```

- check if the patroni cluster is on active mode.

  ```sh
  $ patronictl list
  + Cluster: realm-registry (7106273589750788182) -----+---------+----+-----------+
  | Member                   | Host          | Role    | State   | TL | Lag in MB |
  +--------------------------+---------------+---------+---------+----+-----------+
  | realm-registry-patroni-0 | 10.97.122.229 | Leader  | running |  6 |         0 |
  | realm-registry-patroni-1 | 10.97.121.116 | Replica | running |  6 |           |
  +--------------------------+---------------+---------+---------+----+-----------+
  ```

- to list the backups and restore the specific one, run:

  ```sh
  $ wal-g backup-list
  name modified wal_segment_backup_start
  base_00000003000000000000007E 2022-07-31T01:00:10Z 00000003000000000000007E
  base_000000030000000000000080 2022-08-01T01:00:10Z 000000030000000000000080
  base_000000030000000000000082 2022-08-02T01:00:11Z 000000030000000000000082
  base_000000030000000000000088 2022-08-03T01:00:10Z 000000030000000000000088
  $ wal-g backup-fetch "$PGDATA" base_000000030000000000000088
  ```

- see https://github.com/wal-e/wal-e#backup-list
- see https://github.com/wal-e/wal-e#backup-fetch

## Code security & Vulnerability Disclosure

We make use of most of GitHub's security features that help keep code and secrets secure with dependency vulnerability management in this repository.

### Security advisories

Privately discuss and fix security vulnerabilities in your repository's code. You can then publish a security advisory to alert your community to the vulnerability and encourage community members to upgrade.

- [Security advisories](https://github.com/bcgov/sso-realm-registry/security/advisories)

### Dependabot alerts and security updates

View alerts about dependencies that are known to contain security vulnerabilities, and choose whether to have pull requests generated automatically to update these dependencies.

- [Dependabot alerts](https://github.com/bcgov/sso-realm-registry/security/dependabot)

### Dependabot version updates

Use Dependabot to automatically raise pull requests to keep your dependencies up-to-date. This helps reduce your exposure to older versions of dependencies. Using newer versions makes it easier to apply patches if security vulnerabilities are discovered, and also makes it easier for Dependabot security updates to successfully raise pull requests to upgrade vulnerable dependencies.

- [Dependabot alerts](https://github.com/bcgov/sso-realm-registry/security/dependabot)

### Code scanning

Automatically detect security vulnerabilities and coding errors in new or modified code. Potential problems are highlighted, with detailed information, allowing you to fix the code before it's merged into your default branch.

- [GitHub Actions (CodeQL)](.github/workflows/codeql-analysis.yml)
- [Code scanning alerts](https://github.com/bcgov/sso-realm-registry/security/code-scanning)

### IDIM Web Service proxy API endpoint

The backend API exposes a proxy endpoint that being used by Common Hosted Single Sign-on (CSS) lambda API endpoints to meet the security requirement of IDIM web service and hosted in the same network with it. The IDIM web service backend logic is stored in [IDIM Web Service](./app/pages/api/bceid-service).

- IDIM web service makes use of two of the environment variables:
  1. `BCEID_SERVICE_ID`: OSID # to the BCeID Client Web Services.
  2. `BCEID_SERVICE_BASIC_AUTH`: `Basic Auth` authorization token.
- To generate the authorization token with IDIR account credentials:

  ```sh
  echo -n "<idir_username>:<idir_password>" | base64
  ```
