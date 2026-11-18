#!/bin/sh
# Runs once, on the first start of the `analytics` profile's Postgres (an
# empty data directory): a login and a database for Superset's own metadata,
# next to the `opensteward` database the image creates from POSTGRES_DB.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=pw="$SUPERSET_DB_PASSWORD" <<'SQL'
CREATE ROLE superset LOGIN PASSWORD :'pw';
CREATE DATABASE superset OWNER superset;
SQL
