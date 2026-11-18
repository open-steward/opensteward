# Variables (Bicep parameters)

Bicep declares inputs as `param`s inside [`main.bicep`](./main.bicep) — there is
no separate `variables.tf`-style file. This document mirrors them with defaults
and descriptions so you can review inputs without reading the template. The
`@description` / default on each `param` in `main.bicep` is the source of truth.

## Naming

| Parameter | Default | Description |
| --- | --- | --- |
| `location` | `resourceGroup().location` | Azure region for all resources. |
| `namePrefix` | `opensteward` | Short prefix (3–12 chars) resource names derive from. |
| `uniqueSuffix` | `substring(uniqueString(resourceGroup().id),0,6)` | Stable per-RG suffix for globally-unique names (Key Vault, Postgres). |
| `tags` | `{ app.kubernetes.io/part-of: opensteward, managedBy: bicep-reference-iac }` | Tags on every resource. |

## Kubernetes / Helm consistency (must match `helm install`)

| Parameter | Default | Description |
| --- | --- | --- |
| `k8sNamespace` | `opensteward` | Namespace the chart is installed into; part of the federation subject. |
| `helmReleaseName` | `os` | Helm release name. Chart ServiceAccount = `<release>-opensteward`. |
| `k8sServiceAccountNameOverride` | `''` | Override the KSA name; empty derives `<release>-opensteward` (chart default). |

## AKS

| Parameter | Default | Description |
| --- | --- | --- |
| `kubernetesVersion` | `''` | Control-plane version; empty lets AKS pick the default GA. |
| `systemNodeVmSize` | `Standard_D4s_v5` | System node pool VM size. |
| `systemNodeCount` | `3` | System node pool node count (1–100). |
| `systemNodeOsDiskSizeGb` | `64` | OS disk size (GiB) for the system pool. |

## PostgreSQL Flexible Server

| Parameter | Default | Description |
| --- | --- | --- |
| `postgresAdminUser` | `osadmin` | Administrator login. |
| `postgresAdminPassword` | _(required, `@secure`)_ | Administrator password. Supply out-of-band; used to build the server + DATABASE_URL. Never output. |
| `postgresDatabaseName` | `opensteward` | Application database name. |
| `postgresVersion` | `16` | Major version (`14`/`15`/`16`). |
| `postgresSkuName` | `Standard_D2ds_v5` | Compute SKU (`Standard_B2s` for trials). |
| `postgresTier` | `GeneralPurpose` | `Burstable` / `GeneralPurpose` / `MemoryOptimized`. |
| `postgresStorageSizeGb` | `64` | Storage size (GiB). |
| `postgresAllowPublicAccess` | `true` | Reference convenience: public access + "allow Azure services" firewall rule. **Set `false` for production.** |

## Key Vault / app secrets

| Parameter | Default | Description |
| --- | --- | --- |
| `appSecretsJson` | _(required, `@secure`)_ | JSON object `{JWT_SECRET, SESSION_SECRET, STORE_SECRET, [ADMIN_SECRET]}`. **STORE_SECRET must be stable forever.** Never output. |
| `appSecretName` | `opensteward-app-secrets` | Name of the vault secret; the overlay's `remoteSecretName`. |
| `keyVaultPurgeProtection` | `true` | Enable Key Vault purge protection. |

## Secret parameters — handling

`postgresAdminPassword` and `appSecretsJson` are `@secure()`. Supply them at
deploy time only — via [`deploy.sh`](./deploy.sh) (generates + persists them) or
via env vars referenced in [`main.bicepparam`](./main.bicepparam). They are
stored encrypted by ARM, omitted from deployment history, and **never** returned
through an output. Do not place real values in any committed file.
