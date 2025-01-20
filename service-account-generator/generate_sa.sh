#!/bin/bash
set -e

usage() {
    cat <<EOF
Creates a service account for the dev test and prod environments of the project with
namespace licence plate arg.

Usages:
    $0 <project_licence_plate>

Available licence plates:
    - c6af30

Available Clusters
    - gold

Examples:
    $ $0 c6af30
EOF
}

if [ "$#" -lt 1 ]; then
    usage
    exit 1
fi

licence_plate=$1
cluster="gold"

# create service account in prod
oc -n "$licence_plate"-prod create sa sso-action-deployer-"$licence_plate"



create_role_and_binding() {
  if [ "$#" -lt 3 ]; then exit 1; fi
  licence_plate=$1
  env=$2
  cluster=$3
  namespace="$licence_plate-$env"

  oc process -f ./templates/role-"$cluster".yaml -p NAMESPACE="$namespace" | oc -n "$namespace" apply -f -

  oc -n "$namespace" create rolebinding sso-action-deployer-role-binding-"$namespace"   \
  --role=sso-action-deployer-"$namespace" \
  --serviceaccount="$licence_plate"-prod:sso-action-deployer-"$licence_plate"
}

# for dev, test and prod create the role and role binding
create_role_and_binding "$licence_plate" "prod" "$cluster"

## The realm registry does not need a test service account
# create_role_and_binding "$licence_plate" "test" "$cluster"

create_role_and_binding "$licence_plate" "dev" "$cluster"
