# Local development of the realm registries project

## Install asdf

Run through the steps in [developer guide](./developer-guide.md)

## How to run the project locally

The local development commands can be found in the [app README](../app/README.md)

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
