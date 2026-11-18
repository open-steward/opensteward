#!/usr/bin/env bash
# =============================================================================
# OpenSteward — Azure reference deploy helper
# =============================================================================
# Generates the app secrets + a Postgres password, deploys main.bicep, and
# prints ONLY the non-secret outputs an operator pastes into the Helm overlay.
# It never echoes JWT_SECRET / SESSION_SECRET / STORE_SECRET / ADMIN_SECRET / the
# Postgres password / the assembled DATABASE_URL to stdout.
#
# STORE_SECRET IS FOREVER. It encrypts data at rest. This script generates it
# ONCE on first run and persists the whole JSON to a local state file
# (default: ./.opensteward-secrets.json, gitignored). On subsequent runs it
# REUSES that file so STORE_SECRET (and the others) stay stable. Lose that file
# and you lose the decryption key. Back it up somewhere safe (a password
# manager / pipeline secret store), NOT in git.
#
# Usage:
#   ./deploy.sh -g <resource-group> [-l <location>] [-p <namePrefix>]
#               [-n <k8s-namespace>] [-r <helm-release>]
#               [-s <secrets-state-file>] [--include-admin] [--create-db-secret]
#
#   -g  resource group (required)        -n  k8s namespace      (default opensteward)
#   -l  location (default RG location)   -r  helm release       (default os)
#   -p  name prefix (default opensteward) -s  secrets state file (default ./.opensteward-secrets.json)
#   --include-admin     also generate ADMIN_SECRET
#   --create-db-secret  after `az aks get-credentials`, create the opensteward-db k8s secret
#
# Requires: az (logged in, subscription selected). kubectl only for
# --create-db-secret.
# =============================================================================
set -euo pipefail

RESOURCE_GROUP=""
LOCATION=""
NAME_PREFIX="opensteward"
SECRETS_FILE="./.opensteward-secrets.json"
INCLUDE_ADMIN="false"
K8S_NAMESPACE="opensteward"
HELM_RELEASE="os"
CREATE_DB_SECRET="false"

# Print the header comment block (everything up to the first non-comment line).
usage() { sed -n '2,/^set /{/^set /q;p;}' "$0"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -l|--location)       LOCATION="$2"; shift 2 ;;
    -p|--name-prefix)    NAME_PREFIX="$2"; shift 2 ;;
    -s|--secrets-file)   SECRETS_FILE="$2"; shift 2 ;;
    -n|--namespace)      K8S_NAMESPACE="$2"; shift 2 ;;
    -r|--release)        HELM_RELEASE="$2"; shift 2 ;;
    --include-admin)     INCLUDE_ADMIN="true"; shift ;;
    --create-db-secret)  CREATE_DB_SECRET="true"; shift ;;
    -h|--help)           usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[ -n "$RESOURCE_GROUP" ] || { echo "ERROR: -g <resource-group> is required" >&2; usage; }

# 44-char url-safe-ish token, same shape as the chart's generator.
gen() { head -c 32 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-44; }

# --- App secrets JSON: generate once, then REUSE (keeps STORE_SECRET stable) ---
if [ -f "$SECRETS_FILE" ]; then
  echo "Reusing existing app secrets from $SECRETS_FILE (STORE_SECRET preserved)."
  APP_SECRETS_JSON="$(cat "$SECRETS_FILE")"
else
  echo "No $SECRETS_FILE found — generating app secrets ONCE."
  echo "  >> Back this file up. STORE_SECRET inside it can NEVER change. <<"
  if [ "$INCLUDE_ADMIN" = "true" ]; then
    APP_SECRETS_JSON=$(printf '{"JWT_SECRET":"%s","SESSION_SECRET":"%s","STORE_SECRET":"%s","ADMIN_SECRET":"%s"}' \
      "$(gen)" "$(gen)" "$(gen)" "$(gen)")
  else
    APP_SECRETS_JSON=$(printf '{"JWT_SECRET":"%s","SESSION_SECRET":"%s","STORE_SECRET":"%s"}' \
      "$(gen)" "$(gen)" "$(gen)")
  fi
  umask 077
  printf '%s' "$APP_SECRETS_JSON" > "$SECRETS_FILE"
fi

# --- Postgres password: generate once, persisted next to the secrets file ------
PG_FILE="${SECRETS_FILE%.json}.pgpass"
if [ -f "$PG_FILE" ]; then
  PG_PASSWORD="$(cat "$PG_FILE")"
else
  # Flexible Server requires 3 of 4 char classes; keep it strong + symbol.
  PG_PASSWORD="$(gen)Aa1!"
  umask 077
  printf '%s' "$PG_PASSWORD" > "$PG_FILE"
fi

LOCATION_ARG=()
[ -n "$LOCATION" ] && LOCATION_ARG=(--parameters "location=$LOCATION")

echo "Deploying main.bicep into resource group '$RESOURCE_GROUP'..."
# Secrets are passed as parameters (not persisted in the template). az stores
# @secure() params encrypted and omits them from deployment-history output.
DEPLOY_JSON=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters "namePrefix=$NAME_PREFIX" \
  --parameters "k8sNamespace=$K8S_NAMESPACE" \
  --parameters "helmReleaseName=$HELM_RELEASE" \
  --parameters "postgresAdminPassword=$PG_PASSWORD" \
  --parameters "appSecretsJson=$APP_SECRETS_JSON" \
  "${LOCATION_ARG[@]}" \
  --query properties.outputs -o json)

# --- Non-secret outputs for the overlay (safe to print) ------------------------
get() { printf '%s' "$DEPLOY_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1']['value'])"; }

echo
echo "================ Paste into deploy/helm/overlays/azure-values.yaml ================"
echo "secrets.externalSecrets.azure.vaultUrl   : $(get keyVaultUri)"
echo "secrets.externalSecrets.azure.tenantId   : $(get tenantId)"
echo "secrets.externalSecrets.remoteSecretName : $(get appSecretName)"
echo "serviceAccount.annotations[azure.workload.identity/client-id] : $(get managedIdentityClientId)"
echo
echo "AKS cluster      : $(get aksClusterName)  (rg: $(get resourceGroupName))"
echo "Chart KSA        : $(get chartServiceAccountName)"
echo "Federation subj  : $(get federationSubject)"
echo "Postgres FQDN    : $(get postgresFqdn)"
echo "DATABASE_URL tmpl: $(get databaseUrlTemplate)"
echo "==================================================================================="
echo
echo "NOTE: the DATABASE_URL above has <POSTGRES_PASSWORD> elided. The real value"
echo "(with the password) was NOT printed. To create the opensteward-db secret, run"
echo "this script with --create-db-secret AFTER 'az aks get-credentials', or do it"
echo "yourself from \$PG_FILE."

# --- Optionally create the opensteward-db k8s secret (kubectl context required) -
if [ "$CREATE_DB_SECRET" = "true" ]; then
  FQDN="$(get postgresFqdn)"; USER="$(get postgresAdminUser)"; DB="$(get postgresDatabaseName)"
  DB_URL="postgresql://${USER}:${PG_PASSWORD}@${FQDN}:5432/${DB}?sslmode=require"
  kubectl -n "$K8S_NAMESPACE" create secret generic opensteward-db \
    --from-literal=DATABASE_URL="$DB_URL" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "Created/updated secret opensteward-db in namespace $K8S_NAMESPACE (value not printed)."
fi
