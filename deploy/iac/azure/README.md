# OpenSteward — Azure / AKS reference infrastructure (Bicep)

Reference / example Infrastructure-as-Code that provisions exactly what the
OpenSteward Helm **Azure overlay**
([`deploy/helm/overlays/azure-values.yaml`](../../helm/overlays/azure-values.yaml))
expects — and nothing more. It is a starting point you **fork and harden**, not a
turnkey production deployment. Favour reading it over running it blind.

> This module must stay consistent with the overlay it backs. If the overlay
> changes the ServiceAccount name, the remote secret name, or the secret JSON
> keys, update this module to match.

## What it creates

| Resource | Purpose |
| --- | --- |
| **AKS cluster** | OIDC issuer + Workload Identity enabled; **app-routing** add-on (managed ingress-nginx, the overlay's `webapprouting.kubernetes.io` ingress class). |
| **Azure Database for PostgreSQL Flexible Server** (+ database) | The app database. Becomes the K8s `opensteward-db` secret. |
| **Azure Key Vault** + secret `opensteward-app-secrets` | One secret whose **value is a JSON object** (`JWT_SECRET`, `SESSION_SECRET`, `STORE_SECRET`, optional `ADMIN_SECRET`). |
| **User-assigned Managed Identity** | + a **federated identity credential** bound to the chart's KSA, and a **Key Vault Secrets User** role assignment on the vault. This is the identity External Secrets Operator assumes via Workload Identity. |

## Prerequisites (NOT created here — install in-cluster after deploy)

These are Helm/kubectl concerns, not Azure resources:

- **cert-manager** — issues the TLS certs the overlay references (and the
  `letsencrypt-prod` `ClusterIssuer`).
- **External Secrets Operator (ESO)** — the chart renders a `ClusterSecretStore`
  (`azurekv` + `WorkloadIdentity`) that reads `opensteward-app-secrets`.

The **app-routing** add-on (managed ingress-nginx) IS enabled by this template.

> **This template does not provision Redis.** The overlay's `redis.url`
> (`<AZURE_CACHE_NAME>`) must come from an Azure Cache for Redis you add
> separately, or set `redis.enabled: false` for trials.

## The consistency contract (how this lines up with the chart)

- The chart runs in namespace `k8sNamespace` (default `opensteward`) under a
  ServiceAccount named **`<release>-opensteward`** (the chart's
  `opensteward.fullname`). For release `os` that is `os-opensteward`.
- The federated identity credential's **subject** is
  `system:serviceaccount:<k8sNamespace>:<ksa>` and its **issuer** is the AKS OIDC
  issuer URL. `helmReleaseName` / `k8sNamespace` here MUST match how you
  `helm install`.
- App secrets are ONE Key Vault secret whose value is a JSON object. ESO reads it
  via the ClusterSecretStore the chart renders (`remoteSecretName:
  opensteward-app-secrets`).
- Postgres' `DATABASE_URL` becomes the K8s secret `opensteward-db` (key
  `DATABASE_URL`).

## ⚠️ STORE_SECRET is forever

`STORE_SECRET` (inside the app-secrets JSON) **encrypts application data at
rest**. Generate it **once** and **never change it** — rotating it orphans every
encrypted-at-rest value.

Because the app secrets are passed to Bicep as a `@secure()` **parameter**, a
redeploy that passes a *different* JSON **will silently rotate STORE_SECRET**.
Guard against this:

- Use [`deploy.sh`](./deploy.sh): it generates the JSON **once**, persists it to
  a gitignored state file, and **reuses** it on every later run.
- Back that state file up out-of-band (password manager / pipeline secret). It is
  the decryption key. Losing it = unrecoverable data.
- This is the IaC analogue of "don't let `terraform destroy`/re-apply rotate it."

No secret value is ever printed in an output or in the deploy script's stdout.

## Apply order

```text
0. az login ; az account set --subscription <SUB>
1. az group create -g <RG> -l <LOCATION>
2. Deploy this module                 (creates AKS, Postgres, Key Vault, MI, federation, role)
3. az aks get-credentials -g <RG> -n <aksClusterName>
4. Install prereqs in-cluster:        cert-manager + External Secrets Operator
                                       (+ a letsencrypt-prod ClusterIssuer for cert-manager)
5. Create the opensteward-db secret    (DATABASE_URL) — see below
6. Fill the overlay <PLACEHOLDER>s from the outputs (see outputs.md), then:
     helm install os ../../helm/opensteward \
       -f ../../helm/overlays/azure-values.yaml \
       -f my-secrets-and-hosts.yaml
```

### Deploy — option A: the helper script (recommended)

Generates secrets once, deploys, prints only the non-secret outputs:

```sh
./deploy.sh -g <RG> -l <LOCATION> -p opensteward
# after `az aks get-credentials`, create the DB secret without printing it:
./deploy.sh -g <RG> --create-db-secret
```

### Deploy — option B: raw az + params file

```sh
cp main.bicepparam my.bicepparam      # edit naming as needed
export OPENSTEWARD_PG_PASSWORD='<strong-password>'
export OPENSTEWARD_APP_SECRETS_JSON='{"JWT_SECRET":"…","SESSION_SECRET":"…","STORE_SECRET":"…"}'
az deployment group create -g <RG> --template-file main.bicep --parameters my.bicepparam
```

(`main.bicepparam` reads both secrets from those env vars so nothing secret is
committed.)

### Create the `opensteward-db` secret

The full `DATABASE_URL` (with password) is **never** output. Assemble it from the
`databaseUrlTemplate` output (replace `<POSTGRES_PASSWORD>`), then:

```sh
kubectl -n opensteward create secret generic opensteward-db \
  --from-literal=DATABASE_URL='postgresql://osadmin:<POSTGRES_PASSWORD>@<postgresFqdn>:5432/opensteward?sslmode=require'
```

`deploy.sh --create-db-secret` does this for you using its stored password.
Alternatively, store `DATABASE_URL` as a Key Vault secret and have ESO sync it.

## Wiring the outputs into the overlay

See [`outputs.md`](./outputs.md) for the full table. The four you always paste:

| Output | Overlay field |
| --- | --- |
| `keyVaultUri` | `secrets.externalSecrets.azure.vaultUrl` |
| `tenantId` | `secrets.externalSecrets.azure.tenantId` |
| `managedIdentityClientId` | `serviceAccount.annotations."azure.workload.identity/client-id"` |
| `databaseUrlTemplate` (+ your password) | K8s secret `opensteward-db` / `DATABASE_URL` |

## Files

| File | Purpose |
| --- | --- |
| [`main.bicep`](./main.bicep) | The deployment: resources, parameters (defaults + descriptions), outputs. |
| [`main.bicepparam`](./main.bicepparam) | Example parameters file; reads secrets from env vars. |
| [`variables.md`](./variables.md) | Reference for every parameter (the "variables file"). |
| [`outputs.md`](./outputs.md) | Output → overlay-placeholder mapping. |
| [`versions.json`](./versions.json) | Pinned toolchain + per-resource apiVersions. |
| [`bicepconfig.json`](./bicepconfig.json) | Lint/format config (errors on secrets-in-outputs, etc.). |
| [`deploy.sh`](./deploy.sh) | Generates secrets once (stable STORE_SECRET), deploys, prints non-secret outputs. |

## Production hardening to consider

This reference deliberately keeps things simple. Before production, at minimum:

- **Private Postgres**: set `postgresAllowPublicAccess=false` and put the server
  in a delegated subnet / use private access (the `AllowAllAzureServices`
  firewall rule is a reference convenience only).
- **Network**: private AKS API, Azure CNI + network policy, private Key Vault.
- **AKS-managed AAD / RBAC**, an autoscaling user node pool, multiple zones.
- **Key Vault**: keep purge protection on; restrict `publicNetworkAccess`.
- **HA Postgres** (`highAvailability.mode = ZoneRedundant`) + geo backups.
