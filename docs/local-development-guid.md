# Local development of the realm registries project

## Install asdf

Run through the steps in [developer guide](./developer-guide.md)

## How to run the project locally

The local development commands can be found in the [app README](../app/README.md)

## Running Keycloak locally

The app talks to three separate Keycloak servers (dev, test and prod). Rather than pointing at the
real `loginproxy.gov.bc.ca` servers, you can stand up all three locally:

```
docker compose up -d
```

This starts one Keycloak per environment and runs a one-shot `keycloak-bootstrap` container that
seeds each of them with:

- a `terraform-cli` user in the `master` realm holding the `admin` role — this is the account the app
  authenticates as
- an `idir` realm, used to look up IDIR users
- an `azureidir` realm plus a placeholder `azureidir` identity provider in both that realm and
  `master`, which the realm-access sync needs in order to link users

The bootstrap is idempotent, so it is safe to re-run at any time:

```
docker compose up keycloak-bootstrap
```

| Environment | Admin console              | Admin login   |
| ----------- | -------------------------- | ------------- |
| dev         | http://localhost:9080/auth | admin / admin |
| test        | http://localhost:9081/auth | admin / admin |
| prod        | http://localhost:9082/auth | admin / admin |

Add the following to `app/.env` to point the app at them. Note that the `*_KC_URL` values must _not_
include `/auth` — the app appends it.

```
DEV_KC_URL=http://localhost:9080
DEV_KC_USERNAME=terraform-cli
DEV_KC_PASSWORD=terraform-cli
TEST_KC_URL=http://localhost:9081
TEST_KC_USERNAME=terraform-cli
TEST_KC_PASSWORD=terraform-cli
PROD_KC_URL=http://localhost:9082
PROD_KC_USERNAME=terraform-cli
PROD_KC_PASSWORD=terraform-cli
```

Each server keeps its data in a named volume, so `docker compose down` (and restarts) preserve any
realms you create. To start over from scratch, wipe the volumes with `docker compose down -v`.

This only covers the Keycloak servers the app _manages_. The app's own login (`SSO_URL`) still points
at the real dev environment — no `standard` realm is seeded locally.

## Building and deploying test images.

if you want to test the project in the dev environment, you will need to build an image locally and push it up to the github repos. Helm can then be used to deploy the test image.

### Build and tag the github image locally.

```
docker build . -t ghcr.io/bcgov/sso-realm-registry:realmtesttag
```

### Publishing the image to a remote repos

Publishing the taged image to the sso-switchover-agent repos requires two steps:

1. Login to the ghcr, a guide can be found here: [github guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

1. Pushing the repos up:

```
docker push ghcr.io/bcgov/sso-realm-registry:realmtesttag
```

### Deploying the image to a specific namespace.

This image can be deployed from the local environment using helm. Note you must be logged into the GoldDR cluster for this, not the gold cluster.

```
helm upgrade --install realm-registry . \
-n b861c7-dev \
-f values.yaml \
-f "values-b861c7-dev-local.yaml"
```
