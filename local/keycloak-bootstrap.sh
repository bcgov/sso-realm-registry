#!/usr/bin/env bash
#
# Seeds each local Keycloak instance with the bits the realm registry needs:
#
#   * a `terraform-cli` user in `master` holding the `admin` role — this is the account
#     app/utils/keycloak-core.ts authenticates as (password grant on `admin-cli`)
#   * an `idir` realm, queried by KeycloakCore.findIdirUser
#   * an `azureidir` realm plus an `azureidir` identity provider in both that realm and
#     `master`, which app/controllers/keycloak.ts ensureMasterRealmUser links users against
#
# Runs inside the Keycloak image so kcadm.sh is available; the image ships no curl or jq.
# Every step is idempotent, so re-running against existing volumes is a no-op.

set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
# kcadm writes its session to $HOME by default; keep it somewhere always writable.
CONFIG=/tmp/kcadm.config

KC_SERVERS=${KC_SERVERS:-'http://keycloak-dev:8080 http://keycloak-test:8080 http://keycloak-prod:8080'}
KC_ADMIN_USERNAME=${KC_ADMIN_USERNAME:-admin}
KC_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD:-admin}
TF_CLI_USERNAME=${TF_CLI_USERNAME:-terraform-cli}
TF_CLI_PASSWORD=${TF_CLI_PASSWORD:-terraform-cli}

kc() { "$KCADM" "$@" --config "$CONFIG"; }

# Placeholder IdP config. These identity providers are never used to log in — they only
# have to exist for Keycloak to accept the federated identity links the app creates.
idp_args() {
  local alias=$1
  echo "-s alias=$alias -s providerId=oidc -s enabled=true \
    -s config.clientId=placeholder \
    -s config.clientSecret=placeholder \
    -s config.clientAuthMethod=client_secret_post \
    -s config.authorizationUrl=http://localhost/placeholder/auth \
    -s config.tokenUrl=http://localhost/placeholder/token"
}

wait_for_login() {
  local server=$1
  local attempt=0
  # Doubles as the readiness check: the image has no HTTP client to write a healthcheck with.
  until kc config credentials --server "$server/auth" --realm master \
    --user "$KC_ADMIN_USERNAME" --password "$KC_ADMIN_PASSWORD" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      echo "  !! gave up waiting for $server after $attempt attempts" >&2
      return 1
    fi
    sleep 5
  done
}

ensure_realm() {
  local realm=$1
  if kc get "realms/$realm" >/dev/null 2>&1; then
    echo "  realm $realm already exists"
  else
    kc create realms -s "realm=$realm" -s enabled=true >/dev/null
    echo "  created realm $realm"
  fi
}

ensure_idp() {
  local realm=$1 alias=$2
  if kc get "identity-provider/instances/$alias" -r "$realm" >/dev/null 2>&1; then
    echo "  identity provider $alias already exists in $realm"
  else
    # shellcheck disable=SC2046 # idp_args intentionally word-splits into kcadm flags
    kc create identity-provider/instances -r "$realm" $(idp_args "$alias") >/dev/null
    echo "  created identity provider $alias in $realm"
  fi
}

ensure_terraform_cli_admin() {
  local user_id
  user_id=$(kc get users -r master -q "username=$TF_CLI_USERNAME" -q exact=true \
    --fields id --format csv --noquotes 2>/dev/null | head -1)

  if [ -z "$user_id" ]; then
    user_id=$(kc create users -r master -s "username=$TF_CLI_USERNAME" -s enabled=true -i)
    echo "  created master user $TF_CLI_USERNAME"
  else
    echo "  master user $TF_CLI_USERNAME already exists"
  fi

  kc set-password -r master --userid "$user_id" --new-password "$TF_CLI_PASSWORD"
  kc add-roles -r master --uid "$user_id" --rolename admin
  echo "  granted $TF_CLI_USERNAME the admin role in master"
}

for server in $KC_SERVERS; do
  echo "==> $server"
  wait_for_login "$server"
  ensure_terraform_cli_admin
  ensure_realm idir
  ensure_realm azureidir
  ensure_idp azureidir azureidir
  ensure_idp master azureidir
done

echo "Bootstrap complete."
