# Generating service accounts for the CICD pipeline

The github actions need service accounts to run. The script `generate_sa.sh` will create a service acount for the prod environment of a given openshift project and give that account the roles in the dev, test, and prod environments for deploying the realm registry site.

## Generate the service accounts

While logged into the **Gold** instance run:

`./generate_sa.sh <<LICENCE_PLATE>>`

The service account, roles, and rolebindings will be created.

## Update the github action secrets

The github action `sso-realm-registry/.github/workflows/publish-image.yml` requires 1 secret to deploy resources in Gold and GoldDR.

The service account will generate a secret in the `-prod` namespace with the name `sso-action-deployer-<<LICENCE_PLATE>>-token-#####`. Copy this token into the GithHub secrets on the sso-realm-registry repo.

PROD_OPENSHIFT_TOKEN
DEV_OPENSHIFT_TOKEN
