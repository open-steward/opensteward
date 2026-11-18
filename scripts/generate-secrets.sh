#!/usr/bin/env bash
# Generate cryptographically random values for every secret env var
# this stack needs in production. Output is .env-ready: copy/paste the
# lines into your secret manager (Vault, AWS Secrets Manager, Doppler,
# etc.) or into a Docker `--env-file`.
#
# DO NOT commit the output. DO NOT share it.
#
# Usage:
#   scripts/generate-secrets.sh          # print to stdout
#   scripts/generate-secrets.sh > secrets.env   # write to a file (then chmod 600)

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required but was not found in PATH" >&2
  exit 1
fi

gen() {
  # 48 bytes of entropy → 64 base64 chars after URL-safe padding strip.
  openssl rand -base64 48 | tr -d '\n='
}

cat <<EOF
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# 64 chars each, base64-encoded. Each is ~288 bits of entropy.
SESSION_SECRET=$(gen)
JWT_SECRET=$(gen)
STORE_SECRET=$(gen)
ADMIN_SECRET=$(gen)
SERVICE_SECRET=$(gen)

# First-run bootstrap token. Required in production for POST /api/auth/setup.
# Keep this set after setup — unsetting it re-opens POST /api/auth/setup the
# moment the admin table is empty again (e.g. after a DB wipe or restore).
BOOTSTRAP_TOKEN=$(gen)

# Optional embedded Apache Superset (the compose \`analytics\` profile — see
# docs/deployment/superset.md). Harmless to set when Superset is not used.
# POSTGRES_PASSWORD / SUPERSET_DB_PASSWORD are spliced into URLs, so mint
# those separately with \`openssl rand -hex 32\`.
SUPERSET_SECRET_KEY=$(gen)
SUPERSET_SERVICE_PASSWORD=$(gen)
EOF
