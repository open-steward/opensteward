# OpenSteward — Azure Marketplace listing (Kubernetes application)

Reference artifacts for publishing OpenSteward as an **Azure Container /
Kubernetes-application** offer in [Partner Center](https://partner.microsoft.com/).
This is a **BYOL** offer: the package collects no marketplace metering or entitlement.
The OpenSteward license is a file the buyer names on the form's License step and the
product verifies offline.

| File | Purpose |
| --- | --- |
| [`createUiDefinition.json`](./createUiDefinition.json) | Buyer-facing deployment form (handler `Microsoft.Azure.CreateUIDef`, version `0.1.2-preview`). Its `outputs` block maps each control to a Helm value path. |
| [`manifest.yaml`](./manifest.yaml) | Describes the CNAB / cluster-extension bundle that wraps the chart at [`deploy/helm/opensteward`](../../helm/opensteward) + the [`azure-values.yaml`](../../helm/overlays/azure-values.yaml) overlay, and the images mirrored to the Marketplace ACR. |
| `README.md` | This file — submission steps and how the form outputs feed the chart. |

These are **account-bound, manual** artifacts. An operator submits them through the
Partner Center portal; nothing here calls Azure CLIs.

---

## How the form feeds the chart

The flow is:

```
buyer fills createUiDefinition form
        │  outputs (Helm value paths)
        ▼
cluster-extension configurationSettings (flat dot keys)   ← manifest.yaml mapping
        │  layered AFTER azure-values.yaml overlay defaults
        ▼
helm install opensteward  (onto the buyer's AKS)
```

Each control's `outputs` entry is a Helm value path, so the value lands where the
chart expects it. Buyer input wins over the overlay defaults; blanks fall back to
the overlay, then to the chart `values.yaml`.

### Control → Helm value map

| Form step / control | Helm value | Notes |
| --- | --- | --- |
| Cluster & images · Image registry | `image.registry` | `<registry>/<owner>` prefix. Default is the Marketplace ACR mirror. |
| Cluster & images · Image digest | `image.digest` | Pins every service by digest; preferred for production. |
| Cluster & images · Image tag | `image.tag` | Used only when digest is blank; empty → chart `appVersion`. |
| Database · Database mode | `database.mode` | `postgres` (HA) or `sqlite` (trial). |
| Database · Existing DATABASE_URL secret | `database.external.existingSecret` | Postgres mode only. |
| Database · Key within that secret | `database.external.secretKey` | Defaults `DATABASE_URL`. |
| Database · PVC storage class | `database.persistence.storageClass` | SQLite mode only; default `managed-csi`. |
| Database · Enable Redis | `redis.enabled` | Required to scale `integration-server` past 1 replica. |
| Database · Redis URL | `redis.url` | `rediss://…:6380` Azure Cache endpoint. |
| Application secrets · Secrets source | `secrets.source` | `externalSecrets` \| `existingSecret` \| `generate`. |
| Application secrets · Provider | `secrets.externalSecrets.provider` | Fixed to `azure`. |
| Application secrets · Key Vault URI | `secrets.externalSecrets.azure.vaultUrl` | Bicep output `keyVaultUri`. |
| Application secrets · Tenant ID | `secrets.externalSecrets.azure.tenantId` | AAD tenant GUID. |
| Application secrets · Vault secret name | `secrets.externalSecrets.remoteSecretName` | One JSON blob with `JWT_SECRET`/`SESSION_SECRET`/`STORE_SECRET`(`/ADMIN_SECRET`). |
| Application secrets · Render store | `secrets.externalSecrets.createStore` | Chart renders the ESO `(Cluster)SecretStore`. |
| Application secrets · Existing store name | `secrets.externalSecrets.secretStore.name` | Shown only when *Render store* is unchecked; names the operator-managed `(Cluster)SecretStore` to reuse. |
| Application secrets · Existing K8s secret | `secrets.existingSecret` | `existingSecret` mode only. |
| Ingress & TLS · Ingress class | `ingress.className` | `webapprouting.kubernetes.io` (app-routing) or `nginx`. |
| Ingress & TLS · Admin UI host | `ingress.hosts[0].host` (+ `service: admin`), `publicUrls.adminUi` | |
| Ingress & TLS · API host | `ingress.hosts[1].host` (+ `service: integration-server`), `publicUrls.integrationServer` | |
| Ingress & TLS · SSO public base URL | `publicUrls.adminApi` | `admin-api` is ClusterIP-only; front it yourself for SSO. |
| Ingress & TLS · TLS mode | `ingress.tls.enabled`, `ingress.tls.certManager.enabled`, `ingress.tls.certManager.clusterIssuer`, `ingress.tls.existingSecret` | cert-manager / existing secret / disabled. |
| Workload identity · MI client ID | `serviceAccount.annotations["azure.workload.identity/client-id"]` | The MI ESO federates to; Bicep output `managedIdentityClientId`. |
| License · License secret name | `license.existingSecret` | Optional. A Secret holding the license file, mounted on integration-server only. Empty = community mode. |
| License · Key within that secret | `license.secretKey` | Shown once a secret is named; default `license.key`. |

Fixed (not buyer-editable):

- `ingress.enabled: true`, `publicUrls.scheme: https`.
- `ingress.hosts[*].service` is pinned (`admin`, `integration-server`) — `admin-api`
  is never ingress-exposed.
- `nodeEnv: production` is pinned by the chart so the fail-closed secret assertion
  stays in effect. It is intentionally absent from the form.

---

## Buyer prerequisites (surfaced as info/warning boxes in the form)

The cluster extension installs the chart but **not** these in-cluster operators:

- **Ingress controller** — AKS app-routing add-on, or self-managed ingress-nginx.
- **cert-manager** with the `ClusterIssuer` named on the Ingress & TLS step (when TLS
  = cert-manager), e.g. `letsencrypt-prod`.
- **External Secrets Operator** + OIDC issuer + a user-assigned **managed identity**
  federated to the chart ServiceAccount with **Key Vault Secrets User** on the vault
  (when Secrets = Key Vault).
- **Azure Database for PostgreSQL Flexible Server** reachable from the cluster, and a
  K8s secret holding its `DATABASE_URL` (when Database = postgres).

The reference IaC at [`deploy/iac/azure`](../../iac/azure) provisions the cloud side
(cluster, Postgres, Key Vault entry, identity federation) and prints the outputs that
populate the form — see [`outputs.md`](../../iac/azure/outputs.md).

---

## Building the bundle

The Marketplace tooling produces the real CNAB `bundle.json`; `manifest.yaml`
documents its inputs. At build time:

1. Copy the chart (`deploy/helm/opensteward`) and the Azure overlay
   (`deploy/helm/overlays/azure-values.yaml`) into the bundle.
2. **Mirror the five images** from GHCR into the Marketplace-managed ACR and record
   each multi-arch digest in `manifest.yaml` under `images.services[].digest`:
   `admin`, `admin-api`, `docs-server`, `webhook-gateway`, `integration-server`.
   The chart's `image.registry` is set to the ACR mirror and images are pulled by
   digest (cosign-signed, SBOM + trivy-gated upstream — see
   [`.github/workflows/images.yml`](../../../.github/workflows/images.yml)).
3. Set the `createUiDefinition` `image.registry` / `image.digest` defaults to match
   the mirrored ACR + the published digest so the form's defaults install the signed
   build with no buyer input.

> Keep `manifest.yaml`, the overlay, and the `createUiDefinition` defaults in sync
> with `deploy/helm/opensteward/Chart.yaml` `appVersion` on every release.

---

## Partner Center submission steps

1. **Validate the form locally.** Paste `createUiDefinition.json` into the
   [Create UI Definition Sandbox](https://portal.azure.com/#blade/Microsoft_Azure_CreateUIDef/SandboxBlade)
   and confirm every step renders and conditional fields show/hide correctly.
2. **Create the offer.** In Partner Center → **Marketplace offers** → **New offer**
   → **Azure Container** (Kubernetes application).
3. **Offer setup / Properties / Listing.** Fill the marketplace metadata
   (name, description, categories, logos, support + privacy/legal links). For BYOL,
   **use the Microsoft Standard Contract** — no custom EULA is used; the Elastic License 2.0
   plus OpenSteward's Additional Use Grant (`LICENSE`) governs the software itself — and
   state that licensing is handled outside Azure.
4. **Plan → Technical configuration.** Upload the CNAB bundle built per
   *Building the bundle* (chart + overlay + `createUiDefinition.json`), referencing
   the **Marketplace ACR** images by digest. Attach `createUiDefinition.json` as the
   plan's deployment UI.
5. **Pricing & availability.** Select **BYOL** (no per-usage Azure billing); set
   markets and preview audience.
6. **Review and publish.** Submit; Partner Center runs certification (image scan,
   bundle validation, UI render). Use **Preview** to test an end-to-end install into
   a real AKS cluster before going live.

### Post-publish smoke test (preview)

From the offer's preview link, deploy into a test AKS cluster, fill the form with the
Bicep outputs from [`deploy/iac/azure`](../../iac/azure), and verify:

- All five Deployments become Ready; `admin-api` is ClusterIP (not exposed).
- The Admin UI and API hosts resolve and serve over TLS.
- The ESO `ExternalSecret` syncs `<release>-secrets` from Key Vault (Secrets = Key
  Vault), and pods read it — none CrashLoop on the fail-closed secret assertion.
