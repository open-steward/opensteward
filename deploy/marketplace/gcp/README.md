# OpenSteward on Google Cloud Marketplace (Kubernetes app, BYOL)

Reference artifacts for publishing OpenSteward as a **Google Cloud Marketplace
Kubernetes application**, delivered by a **deployer image** that wraps the
[OpenSteward Helm chart](../../helm/opensteward) and a **`schema.yaml`** that maps
the Marketplace deploy form to the chart's values.

> **Bring-Your-Own-License (BYOL).** There is **no usage reporting, no
> marketplace entitlement check, and no Cloud Commerce metering**. The chart
> contains no metering code, so `schema.yaml` deliberately omits the
> `reportingSecret` / usage-meter blocks (those are only required for
> usage-based pricing). The OpenSteward license is a file verified offline: the
> buyer names its Kubernetes Secret in the deploy form (`license.existingSecret`),
> and the license itself is obtained out of band.

These are **reference** artifacts. Publishing is an **account-bound, manual**
process performed by an operator through the **Producer Portal** and the
[`mpdev`](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools) CLI.
**Do not** run any CLI from this repo's automation — the commands below are for a
human operator with a registered Producer Portal partner account.

## Files

| File | Purpose |
|------|---------|
| `schema.yaml` | x-google-marketplace **v2** schema — declares the five service images (under `x-google-marketplace.images`) for republish + digest-pin, and maps the deploy-form UI to chart values (image registry/tag, database mode + external secret, ingress host, secrets provider, publicUrls, license secret), required fields, deployer/Application bindings. |
| `overlay-values.yaml` | GCP Marketplace defaults baked into the deployer (Postgres/HA, External Secrets → Secret Manager, ingress-nginx + cert-manager). Mirrors [`deploy/helm/overlays/gcp-values.yaml`](../../helm/overlays/gcp-values.yaml). |
| `deployer/Dockerfile` | Builds the deployer image `FROM gcr.io/cloud-marketplace-tools/k8s/deployer_helm`, copies the chart + schema into the expected `/data` layout, and **deep-merges** `overlay-values.yaml` into the chart's `values.yaml` at build time (the base deployer has no extra-values-file mechanism — it renders the chart's own `values.yaml` plus schema `--set` only). |

## How it fits together

```
overlay-values.yaml  ──(deep-merged at BUILD time into)──►  chart values.yaml
                                                                  │
Marketplace deploy form  ──(schema.yaml)──►  helm --set ...       │
                                                  │               │
                                                  ▼               ▼
                                    helm template deploy/helm/opensteward
                                    (merged values.yaml  <  --set from form)
                                                  ▼
                              Deployments / Services / Ingress / Application CR
```

Merge precedence (lowest → highest): chart `values.yaml` **with the overlay
already merged in** < operator deploy-form (`--set` from `schema.yaml`). The
overlay is NOT a separate `-f` file at template time — the deployer base does not
support one, so the Dockerfile merges it into `values.yaml` during the build.

## Prerequisites (operator)

- A **Producer Portal** partner account with OpenSteward registered as a product.
- `gcloud`, `docker`, `kubectl`, `helm`, and `mpdev` installed locally; a test
  GKE cluster (1.25+) for `mpdev verify`.
- The target **Artifact Registry** repo, e.g.
  `us-docker.pkg.dev/<PROJECT>/opensteward`.
- In the **test cluster**: External Secrets Operator, ingress-nginx, and
  cert-manager (these are cluster prerequisites — the deployer does **not**
  install them). A reachable Cloud SQL instance and a Secret Manager secret with
  the app-secrets JSON (see [`deploy/iac/gcp`](../../iac/gcp)).

## 1. Push images to Artifact Registry

Marketplace republishes **all** declared images into the published product's
Artifact Registry repo and pins each by **digest** (`sha256:...`) in the listing.
OpenSteward's five service images are built multi-arch and published to GHCR
(`ghcr.io/open-steward/<service>`, see `.github/workflows/images.yml`); mirror
them into Artifact Registry. All five are declared under
`x-google-marketplace.images` in `schema.yaml` so Marketplace republishes and
digest-pins each one.

```bash
AR=us-docker.pkg.dev/<PROJECT>/opensteward
VERSION=0.1.0   # matches Chart.appVersion / the platform/vX.Y.Z release

for svc in admin admin-api docs-server webhook-gateway integration-server; do
  # Copy the multi-arch manifest by digest (preserves provenance/signatures).
  gcrane cp ghcr.io/open-steward/$svc:$VERSION $AR/$svc:$VERSION
done
```

Override `image.registry` to the Artifact Registry repo prefix (shared by all
five services), e.g. `us-docker.pkg.dev/<PROJECT>/opensteward`; the chart's image
helper forms `"<image.registry>/<service>:<tag>"`.

> **Chart limitation — per-service digest pinning.** The chart has a *single*
> `image.registry` + `image.tag`/`image.digest` shared across all five services,
> so its rendered manifests cannot embed five *distinct* per-service `@digest`
> references. The republished images are digest-pinned **in the Marketplace
> listing**; the chart references them by the shared registry + tag. Because the
> chart cannot embed per-service digests, `schema.yaml` declares the five images
> (for republish + listing digest pin) but does **not** expose `image.digest`.

## 2. Build and push the deployer image (digest-pinned)

```bash
# From the repo root (the chart path in the Dockerfile is repo-relative).
docker build \
  -f deploy/marketplace/gcp/deployer/Dockerfile \
  -t $AR/deployer:$VERSION .

docker push $AR/deployer:$VERSION
gcrane digest $AR/deployer:$VERSION   # pin the deployer by digest in the listing
```

Pin the base image (`deployer_helm`) by digest in CI for reproducibility; the
Dockerfile uses a readable tag for clarity.

## 3. `mpdev verify` (automated smoke test)

`mpdev verify` deploys the app into a throwaway namespace on your test cluster
using the deployer image, runs the chart's tests, and tears it down. It reads
`schema.yaml` from the image.

```bash
mpdev verify \
  --deployer=$AR/deployer:$VERSION
```

Because some values are environment-specific (project ID, hosts, GSA email),
either provide a verify-time parameters file or point `secrets.source=generate`
+ `database.mode=sqlite` for the verify run (a self-contained smoke test) — then
verify the production path (`postgres` + `externalSecrets`) manually with
`mpdev install` below.

## 4. `mpdev install` (manual install on the test cluster)

```bash
mpdev install \
  --deployer=$AR/deployer:$VERSION \
  --parameters='{
    "name": "opensteward",
    "namespace": "opensteward",
    "image.registry": "us-docker.pkg.dev/<PROJECT>/opensteward",
    "image.tag": "0.1.0",
    "database.mode": "postgres",
    "database.external.existingSecret": "opensteward-db",
    "secrets.source": "externalSecrets",
    "secrets.externalSecrets.provider": "gcp",
    "secrets.externalSecrets.gcp.projectID": "<PROJECT>",
    "secrets.externalSecrets.gcp.clusterLocation": "<REGION>",
    "secrets.externalSecrets.gcp.clusterName": "<CLUSTER>",
    "secrets.externalSecrets.remoteSecretName": "opensteward-app-secrets",
    "serviceAccount.annotations.iam\\.gke\\.io/gcp-service-account": "opensteward-eso@<PROJECT>.iam.gserviceaccount.com",
    "ingress.hosts[0].host": "admin.example.com",
    "ingress.hosts[1].host": "api.example.com",
    "publicUrls.adminUi": "https://admin.example.com",
    "publicUrls.integrationServer": "https://api.example.com",
    "license.existingSecret": "opensteward-license"
  }'
```

Confirm the five Deployments come up, the Ingress gets an address, cert-manager
issues certs, and the ExternalSecret syncs the app secrets. Then
`mpdev install`-uninstall to clean up.

## 5. Submit through the Producer Portal

1. In the **Producer Portal**, open the OpenSteward product → **Kubernetes app**.
2. Set the **deployer image** to the Artifact Registry **digest** from step 2,
   and list the five service images (by digest) under the version's images.
3. Upload / confirm `schema.yaml` is the one baked into the deployer.
4. Fill listing metadata (overview, support, EULA). For the EULA, **use Google's
   standard terms** — no custom EULA is used; the Elastic License 2.0 plus OpenSteward's
   Additional Use Grant (`LICENSE`) governs the software itself.
   Mark the pricing model as **BYOL** — no metering / Cloud Commerce integration.
5. Submit the version for Google review. Address review feedback, re-`verify`,
   re-push the deployer (new digest), and resubmit as needed.

## Notes & caveats

- **`admin-api` is never exposed** via ingress (ClusterIP only). The deploy form
  only offers the four exposable services for ingress hosts; `publicUrls.adminApi`
  is the externally reachable URL the browser is redirected through for SSO
  callbacks, typically fronted by the admin host.
- **GKE ingress:** this listing uses **ingress-nginx**. The chart does not
  template the container-native LB (NEG) annotations per Service that
  GKE-native GCE ingress requires.
- **Secret Manager secret shape:** one secret whose **value is a JSON object**
  with `JWT_SECRET` / `SESSION_SECRET` / `STORE_SECRET` (and optionally
  `ADMIN_SECRET`). `STORE_SECRET` is the data-at-rest key — generate once, never
  rotate casually (see the chart README rotation runbook).
- **License:** the deployer runs `helm template`, so there is no Helm release
  to upgrade after install. Set **License secret** (`license.existingSecret`)
  in the deploy form. The mount is optional, so an install can name
  `opensteward-license` before the Secret exists: create it later with
  `kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key`
  and restart integration-server once. Left empty, the install runs in
  community mode until it is redeployed with the field set. See
  [docs/deployment/license.md](../../../docs/deployment/license.md).
- **Image provenance:** the GHCR images are cosign-signed with SBOM + a Trivy
  gate. Preserve the signatures when mirroring (copy by digest with `gcrane`/
  `cosign copy`) so consumers can still verify them in Artifact Registry.
- Keep `schema.yaml`'s `publishedVersion`, the chart's `appVersion`, the `VERSION`
  file, and the image digests in lockstep for each coordinated release.
