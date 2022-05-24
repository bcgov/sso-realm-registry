# Realm Registry App Helm Chart

The helm chart installs k8s objects with the release name `realm-registry`.

## Installing the Chart

To install the chart on a specific namespace.

```bash
$ make install namespace=<namespace>
```

To upgrade the chart on a specific namespace.

```bash
$ make upgrade namespace=<namespace>
```

To uninstall the chart on a specific namespace.

```bash
$ make uninstall namespace=<namespace>
```

To lint the chart on a specific namespace.

```bash
$ make lint namespace=<namespace>
```

### Development Notes

- This Helm chart expects a secret object, defaults to `realm-registry`, which contains the following confidential environments:
  1. `SSO_CLIENT_ID`
  1. `SSO_CLIENT_SECRET`
  1. `DEV_KC_URL`
  1. `DEV_KC_CLIENT_ID`
  1. `DEV_KC_CLIENT_SECRET`
  1. `TEST_KC_URL`
  1. `TEST_KC_CLIENT_ID`
  1. `TEST_KC_CLIENT_SECRET`
  1. `PROD_KC_URL`
  1. `PROD_KC_CLIENT_ID`
  1. `PROD_KC_CLIENT_SECRET`
  1. `BCEID_SERVICE_BASIC_AUTH`
  1. `BCEID_SERVICE_ID`
  1. `JWT_SECRET`
