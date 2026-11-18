# OpenSteward on AWS Marketplace — Container Product (Helm delivery)

Reference artifacts for listing OpenSteward on **AWS Marketplace** as a
**Container Product** using the **Helm delivery option**, on a **Bring Your Own
License (BYOL)** pricing model.

> This is a **reference, operator-driven** procedure. Publishing is **manual and
> account-bound** — it happens in the **AWS Marketplace Management Portal**
> (<https://aws.amazon.com/marketplace/management/>) signed in as the registered
> seller. Nothing here runs a CLI on your behalf; the commands are copy-paste
> recipes you run yourself with seller credentials.

OpenSteward ships as a Helm chart (`deploy/helm/opensteward`) that deploys five
container images. On AWS Marketplace those five images live in an **AWS-managed
ECR** that the portal assigns to the Helm delivery option, referenced **by
digest**. The only delta from a normal install is *where the images are pulled
from* — captured by the thin overlay in this directory.

## Contents

| File | Purpose |
| --- | --- |
| `aws-marketplace-values.yaml` | Thin values overlay. Overrides `image.registry` → the Marketplace ECR, pins `image.digest`, sets `image.pullPolicy`. Layered on top of `overlays/aws-values.yaml`. |
| `README.md` | This file — portal submission steps + the buyer-facing parameter map. |

## The five images

All published to GHCR by `.github/workflows/images.yml` as multi-arch
(amd64 + arm64), digest-pinned, cosign-signed (keyless), with an SBOM
attestation and a Trivy gate:

- `admin`
- `admin-api`
- `docs-server`
- `webhook-gateway`
- `integration-server`

Source registry: `ghcr.io/open-steward/<service>`. The chart's `image.registry`
is a single `<registry>/<owner>` string; the image helper forms
`<registry>/<service>@<digest>`. The Marketplace overlay just repoints
`image.registry` at the AWS-managed ECR.

---

## Submission steps (AWS Marketplace Management Portal)

### 0. Prerequisites

- A **registered AWS Marketplace seller** account with the product role/policy
  to create Container Products (seller registration + tax/banking complete; BYOL
  does not require the disbursement setup that metered/paid listings do, but the
  account must still be a registered seller).
- The five images published and **green** in `images.yml` for the platform
  release you intend to list (multi-arch manifest, SBOM, **Trivy gate passed**,
  cosign signature present). The release is the `platform/vX.Y.Z` tag; the
  current coordinated version is in `VERSION` / `Chart.appVersion`.
- Local tooling to re-tag and push: `docker` (or `crane`/`skopeo`), the `aws`
  CLI, and `cosign`. `crane`/`skopeo` are preferred because they **copy by
  digest and carry cosign signatures across in one step** (see step 3).

### 1. Create the Container Product

1. Portal → **Products → Container → Create container product**.
2. Fill the listing detail: product title (**OpenSteward**), short + long
   description, categories (Application Development / Integration), highlights,
   support contact, and the EULA. For BYOL, **select the standard AWS Marketplace
   EULA** — no custom EULA is used; the Elastic License 2.0 plus OpenSteward's Additional
   Use Grant (`LICENSE`) governs the software itself. There is
   **no Pricing dimension** to configure (see step 6).
3. Save the draft. The portal mints a **product id / UUID** you will see again in
   the ECR repository path.

### 2. Add the Helm delivery option

1. On the product draft → **Add delivery option → Helm chart**.
2. The portal provisions an **AWS-managed ECR** for this product and shows the
   **repository URI + push commands**. Copy the repository URI — it is the value
   that goes into `image.registry` in `aws-marketplace-values.yaml`:

   ```
   <SELLER_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<MARKETPLACE_PATH>
   ```

   `<MARKETPLACE_PATH>` is the namespace the portal assigns (commonly
   `<product-uuid>/opensteward`). The image helper appends `/<service>`, so each
   service resolves to `<registry>/<service>@<digest>`.
3. Provide the **Helm chart** itself. Package `deploy/helm/opensteward` and point
   its values at the Marketplace ECR (the chart's `image.registry`); the
   `aws-marketplace-values.yaml` overlay in this directory is exactly that
   override. The delivery option records the chart + the **QuickLaunch /
   deployment template** metadata (target: EKS, Helm).

### 3. Push the five images to the seller ECR — by digest, signatures preserved

Authenticate to the Marketplace ECR, then **copy each image from GHCR by
digest** so the bytes (and the cosign signature + SBOM attestation, which are
stored as additional OCI references in the same repo) land unchanged.

```sh
# 0) Set these from the portal (step 2) and your release.
REGION=<REGION>
SELLER_ACCOUNT_ID=<SELLER_ACCOUNT_ID>
MP_REGISTRY=$SELLER_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/<MARKETPLACE_PATH>
GHCR=ghcr.io/open-steward
VERSION=<X.Y.Z>   # the platform/vX.Y.Z release you are listing

# 1) Log in to BOTH registries.
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$SELLER_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
# (GHCR is public for these images; `docker login ghcr.io` only if rate-limited.)

# 2) Copy each service BY DIGEST. crane/skopeo carry the cosign signature +
#    SBOM attestation in the same pass; plain `docker pull/push` does NOT.
for svc in admin admin-api docs-server webhook-gateway integration-server; do
  # Resolve the multi-arch manifest-list digest for this release.
  DIGEST=$(crane digest "$GHCR/$svc:$VERSION")
  echo "$svc -> $DIGEST"
  # Copy image + its signature/attestation tags (sha256-<digest>.sig / .att).
  crane copy "$GHCR/$svc@$DIGEST" "$MP_REGISTRY/$svc@$DIGEST"
  # OR, with skopeo (also copies the whole repo's referrers):
  # skopeo copy --all docker://$GHCR/$svc@$DIGEST docker://$MP_REGISTRY/$svc@$DIGEST
done
```

> **Preserving cosign signatures.** Cosign keyless signatures and the SBOM
> attestation are stored as extra OCI artifacts alongside the image
> (`sha256-<digest>.sig`, `sha256-<digest>.att`). `crane copy` / `skopeo
> copy --all` move them with the image; a `docker pull` then `docker push`
> **strips** them and changes the digest. Always copy by digest with a
> referrer-aware tool. After copying, re-verify against the Marketplace ECR:
>
> ```sh
> cosign verify "$MP_REGISTRY/integration-server@$DIGEST" \
>   --certificate-identity-regexp 'https://github.com/open-steward/.*' \
>   --certificate-oidc-issuer https://token.actions.githubusercontent.com
> ```

Record the **shared release digest** and paste it into
`aws-marketplace-values.yaml` → `image.digest`. (The overlay uses a single
`image.digest` for all five services — see the note in that file.)

### 4. Version + architecture metadata

In the Helm delivery option's **version** form:

- **Version title / number** — match the platform release (`vX.Y.Z`), the same
  value as `Chart.appVersion` / `VERSION`.
- **Helm chart version** — `Chart.yaml` `version` (the chart SemVer, distinct
  from `appVersion`).
- **Supported architectures** — declare **amd64 (x86_64) and arm64**; the images
  are multi-arch manifest lists built on native runners.
- **Kubernetes / EKS compatibility** — `Chart.yaml` `kubeVersion` is
  `>=1.25.0-0`; declare the EKS versions you've validated.
- **Release notes** — link the GitHub release for `platform/vX.Y.Z`.

### 5. AWS Marketplace CVE scan

On submission, AWS Marketplace runs its **own vulnerability (CVE) scan** on the
pushed images before the listing goes live.

- The chart's CI **front-runs this gate**: `.github/workflows/images.yml` runs a
  **Trivy scan that fails the build on fixable HIGH/CRITICAL** OS + library vulns
  (`severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: 1`) on the exact
  digest you are publishing. So an image that reached GHCR has already cleared the
  same class of findings AWS will look for — the Marketplace scan should pass.
- If AWS flags something Trivy didn't (newer feed, unfixed CVE policy, etc.):
  patch the base image / dependency, **re-run `images.yml` to produce a new
  digest**, re-copy (step 3), update `image.digest` (step 4), and resubmit. Do
  **not** hand-edit images in the Marketplace ECR.

### 6. Pricing model — BYOL (no metering)

- **Pricing model: "Bring Your Own License" (BYOL).** The buyer brings a license
  obtained outside Marketplace; AWS does not bill per-hour/per-unit through the
  listing.
- **No metering, no entitlement integration.** OpenSteward ships **no marketplace
  metering or entitlement code** — there is no AWS Marketplace Metering Service call,
  no `aws-marketplace:MeterUsage`, no AWS Marketplace Entitlement check in the
  images. Do **not** configure usage dimensions or a metering SDK; a BYOL Container
  Product does not require them. The OpenSteward license is a file the buyer mounts
  from a Kubernetes Secret (`license.existingSecret`), verified offline; nothing
  is reported to the publisher or to AWS.
- Set product **availability / regions** and submit for AWS review. After AWS
  approves, the listing publishes and buyers can subscribe (free, BYOL) and pull
  the images from the Marketplace ECR.

---

## Buyer-facing parameter map

What a subscriber fills in after pulling the chart + images. They layer
`overlays/aws-values.yaml` + `aws-marketplace-values.yaml` (this directory) +
their own values file. Every name below is a **real chart value** validated by
`opensteward/values.schema.json`.

| Chart parameter | What the buyer provides | Notes |
| --- | --- | --- |
| `image.registry` | Marketplace ECR URI (from portal) | Pre-filled by `aws-marketplace-values.yaml`. `<registry>/<owner>` form; helper appends `/<service>`. |
| `image.digest` | Release manifest digest | Pre-filled by `aws-marketplace-values.yaml`. Digest-pinned; tag ignored when set. |
| `image.tag` | (leave empty) | Digest wins; empty falls back to `Chart.appVersion`. |
| `image.pullPolicy` | `IfNotPresent` | Correct for immutable digest refs. |
| `database.mode` | `sqlite` (single-node trial) or `postgres` (HA) | AWS overlay defaults to `postgres`. |
| `database.external.existingSecret` | K8s Secret holding `DATABASE_URL` for RDS | Required in `postgres` mode. Key = `database.external.secretKey` (default `DATABASE_URL`). |
| `redis.enabled` / `redis.url` | Enable + ElastiCache URL (`rediss://…:6379`) | Required before scaling `integration-server` past 1 replica. |
| `secrets.source` | `existingSecret` \| `externalSecrets` \| `generate` \| `plain` | AWS overlay uses `externalSecrets` (ESO + Secrets Manager). |
| `secrets.externalSecrets.provider` | `aws` | With `secrets.source=externalSecrets`. Pair with `serviceAccount.annotations` (IRSA) + `externalSecrets.aws.region` + `remoteSecretName`. |
| `secrets.existingSecret` | Operator-managed Secret name | When `secrets.source=existingSecret`. Holds `JWT_SECRET`/`SESSION_SECRET`/`STORE_SECRET` (+ optional `ADMIN_SECRET`), ≥32 chars each. |
| `publicUrls.adminUi` | Browser URL for the admin UI | Must match the `admin` ingress host. |
| `publicUrls.adminApi` | Public SSO callback base URL (SAML ACS / OIDC) | admin-api is ClusterIP-only; this is its externally-reachable SSO URL. |
| `publicUrls.docsServer` | Docs server URL | Cross-app guide links. |
| `publicUrls.integrationServer` | Canonical Connect-Link / public base URL | Must match the `integration-server` ingress host. |
| `ingress.className` | `alb` (AWS Load Balancer Controller) | AWS overlay default. |
| `ingress.hosts[].host` / `.service` | Hostnames → exposed service | `service ∈ admin \| docs-server \| webhook-gateway \| integration-server` (admin-api never exposed). |
| `ingress.tls` | `enabled: false` with ALB + ACM cert | ALB terminates TLS via `alb.ingress.kubernetes.io/certificate-arn`; no in-cluster Secret. |
| `serviceAccount.annotations` | `eks.amazonaws.com/role-arn: <IRSA-role>` | IRSA role ESO assumes for `secretsmanager:GetSecretValue`. |
| `license.existingSecret` | K8s Secret holding the OpenSteward license file | Optional; empty = community mode. Mounted on `integration-server` only. See [the license on a marketplace install](../README.md#the-opensteward-license-on-a-marketplace-install). |
| `license.secretKey` | Key inside that Secret | Default `license.key`. |

See `deploy/helm/overlays/aws-values.yaml` for the worked EKS example these map
onto, and `deploy/helm/opensteward/README.md` for the full install guide.

## Layering recap

```sh
helm install os deploy/helm/opensteward \
  -f deploy/helm/overlays/aws-values.yaml \               # EKS topology
  -f deploy/marketplace/aws/aws-marketplace-values.yaml \ # Marketplace ECR images (this dir)
  -f my-secrets-and-hosts.yaml                            # buyer's hosts + secret wiring
```
