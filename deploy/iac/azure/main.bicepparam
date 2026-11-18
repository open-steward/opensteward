// =============================================================================
// Example parameters for main.bicep  (Bicep parameters file — .bicepparam)
// =============================================================================
//
// Copy this, fill in the secrets, and deploy:
//
//   az deployment group create \
//     --resource-group <RG> \
//     --template-file main.bicep \
//     --parameters main.bicepparam
//
// SECRETS — do NOT hardcode real values in a committed file. Either:
//   (a) use deploy.sh, which generates appSecretsJson + a Postgres password and
//       passes them on the CLI (nothing committed), or
//   (b) reference Key Vault / env at deploy time, e.g.
//         param postgresAdminPassword = readEnvironmentVariable('PGPASS')
//         param appSecretsJson        = readEnvironmentVariable('APP_SECRETS_JSON')
//
// The literals below are PLACEHOLDERS so the file is self-describing — replace
// them. STORE_SECRET in particular must be STABLE forever (see README).
// =============================================================================

using './main.bicep'

// --- Naming -------------------------------------------------------------------
param namePrefix = 'opensteward'
// param location = 'westeurope'   // defaults to the RG location
// param uniqueSuffix = 'abc123'   // defaults to a stable hash of the RG id

// --- Kubernetes / Helm consistency (MUST match how you `helm install`) --------
param k8sNamespace = 'opensteward'
param helmReleaseName = 'os' // => chart ServiceAccount "os-opensteward"

// --- AKS ----------------------------------------------------------------------
param systemNodeVmSize = 'Standard_D4s_v5'
param systemNodeCount = 3

// --- PostgreSQL ---------------------------------------------------------------
param postgresAdminUser = 'osadmin'
// Supply out-of-band. Example using an env var (preferred over a literal):
param postgresAdminPassword = readEnvironmentVariable('OPENSTEWARD_PG_PASSWORD', '')
param postgresDatabaseName = 'opensteward'
param postgresSkuName = 'Standard_D2ds_v5'
param postgresTier = 'GeneralPurpose'

// --- App secrets (JSON) -------------------------------------------------------
// JSON object with JWT_SECRET / SESSION_SECRET / STORE_SECRET (+ optional
// ADMIN_SECRET). STORE_SECRET MUST NEVER CHANGE. deploy.sh generates this for
// you; here we read it from an env var so nothing secret is committed.
param appSecretsJson = readEnvironmentVariable('OPENSTEWARD_APP_SECRETS_JSON', '')
