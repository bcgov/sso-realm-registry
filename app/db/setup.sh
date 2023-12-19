#!/bin/bash

if [[ -n "$1" ]]; then
    db="$1"
else
    db="realm_registry"
fi

postgres_username=<<postgres_username>>

echo "SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec" | psql -U $postgres_username -d postgres

psql -U $postgres_username -d $db -f "../../helm/webapp/migration.sql" -qtA --set ON_ERROR_STOP=1
