# SSO Realm Registry

repository for SSO realm registry and helm chart

## Tech Stack

- [NextJS (ReactJS)](https://nextjs.org/): a React framework that gives you building blocks to create web applications.
- [Spilo](https://github.com/zalando/spilo): a Docker image that provides [PostgreSQL](https://www.postgresql.org/) and [Patroni](https://github.com/zalando/patroni) bundled together.

  - Postgres 14 and Patroni 2.1.3 are currently installed in OCP namespaces.
  - We check PostgreSQL security vulnerabilities in supported versions and release history to mitigate the known issues and potential version deprecation:
    - see https://www.postgresql.org/support/versioning/
    - see https://www.postgresql.org/support/security/
  - We check spilo release history to upgrade patroni version as needed:
    - see https://github.com/zalando/spilo/releases
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

using Patroni's built in https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md#file-system

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
