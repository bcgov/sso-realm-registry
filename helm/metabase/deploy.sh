#!/bin/bash

if [ "$#" -lt 1 ]; then
    exit 1
fi

namespace=$1

helm repo add sso-charts https://bcgov.github.io/sso-helm-charts
helm repo update

helm upgrade --install sso-metabase sso-charts/metabase -n "$namespace" -f values.yaml --version v0.1.1
