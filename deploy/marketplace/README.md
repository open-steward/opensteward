# Cloud marketplace listings (BYOL)

Reference artifacts for listing OpenSteward on the three cloud marketplaces as a
**BYOL / container product — no marketplace metering or entitlement API**. The customer deploys
into infrastructure they own; nothing reports usage to the publisher or the marketplace.

These are the *engineering* artifacts (UI schemas, deployer, packaging, image-mirroring).
The *listing acts* — seller-account registration, legal/tax/banking onboarding,
pricing, and portal submission/approval — are account-bound manual steps only the
publisher can do. Each cloud's README has that portal checklist.

**Licensing:** each listing uses the **marketplace's standard contract** (standard AWS
Marketplace EULA / Microsoft Standard Contract / Google standard terms). There is no
custom EULA in this repo — the software itself is governed by the Elastic License 2.0 plus
OpenSteward's Additional Use Grant (`LICENSE`). BYOL listings suit that arrangement: the
marketplace handles distribution, and the licence is settled out of band, which is also how
a [commercial licence](../../COMMERCIAL-LICENSE.md) is arranged for the one restricted use
case.

| cloud | mechanism | key artifacts |
|---|---|---|
| [AWS](aws) | Container Product, Helm delivery → seller ECR | `aws-marketplace-values.yaml` (image.registry → ECR) + README |
| [Azure](azure) | Partner Center Kubernetes-app offer → Marketplace ACR | `createUiDefinition.json` (buyer form) + `manifest.yaml` + README |
| [GCP](gcp) | Producer Portal + `mpdev`, deployer image → Artifact Registry | `schema.yaml` (x-google-marketplace v2) + `deployer/Dockerfile` + `overlay-values.yaml` + README |

Plus, shared:
- [`.github/workflows/marketplace-mirror.yml`](../../.github/workflows/marketplace-mirror.yml) — mirrors the published GHCR images to ECR/ACR/Artifact Registry via `cosign copy` (preserves digest + signatures + SBOM), gated per-cloud on a repo variable so it's a no-op until you configure cloud OIDC.

## Why these "just work" with the chart

The chart is marketplace-ready: `image.registry` is a single overridable
string, `values.schema.json` exposes every install knob (so it maps cleanly to each
portal's UI), and images are digest-pinned, cosign-signed, SBOM'd, and Trivy-gated
(the gate front-runs each marketplace's CVE scan). Each listing overrides `image.registry`
to the cloud's managed registry and reuses the per-cloud overlay
([`deploy/helm/overlays`](../helm/overlays)) for ingress/secrets/identity.

## Known limitation — per-service digest pinning

The chart has **one** `image.registry` + **one** `image.digest`, but there are five
service images with five distinct digests. So the listings reference images by
**registry + version tag** (`<registry>/<service>:<version>`), which the marketplace
republishes (and pins on its side).

## The OpenSteward license on a marketplace install

Unless the buyer names a license Secret, a marketplace install starts in community mode: all current verticals, 1 connection, 1 tenant. It says so in the integration-server log and, when `ADMIN_SECRET` is in the env Secret, on the admin System page. `ADMIN_SECRET` is optional on every listing; without it the System page reports the license status as unavailable instead (see the chart README's [License](../helm/opensteward/README.md#license) section). To license it, create a Secret holding the file in the install's namespace:

```sh
kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key
```

Then set the chart value `license.existingSecret` to that Secret's name (and `license.secretKey` if the key is not `license.key`). The volume is optional, so the value can name a Secret you create later; restart integration-server once after creating it. How you set the value depends on who owns the Helm release, which differs by listing:

- **AWS (Helm delivery).** The buyer runs Helm and owns the release. Put `license.existingSecret: opensteward-license` in the values file at install, or on a running install:

  ```sh
  helm upgrade <release> <chart> --reuse-values --set license.existingSecret=opensteward-license
  ```

- **Azure (cluster extension).** At install, the form's **License** step sets it. The extension owns the release, so on a running install set the value as an extension configuration setting, not with `helm upgrade`. A hand-run upgrade can be undone by the extension's next update, which unmounts the license and silently puts the install back in community mode. For example (`az k8s-extension list` names the extension):

  ```sh
  az k8s-extension update --cluster-type managedClusters --cluster-name <cluster> \
    --resource-group <resource-group> --name <extension> \
    --configuration-settings license.existingSecret=opensteward-license
  ```

- **GCP (deployer image).** The deploy form's **License secret** field (`schema.yaml` property `license.existingSecret`) sets it, and that form is the only place: the deployer runs `helm template` and applies the manifests, so there is no Helm release to upgrade later. Name the Secret at deploy time even if you will create it later. An install deployed with the field empty stays in community mode until it is redeployed with the field set, or installed directly with Helm (the AWS steps above then apply).

The license is a file verified offline. Nothing is metered or reported to the publisher or the marketplace. See [docs/deployment/license.md](../../docs/deployment/license.md).

## Validation checks

- AWS values render clean through `helm template` + `kubeconform` (ECR registry, digest placeholders).
- `createUiDefinition.json` parses; handler `Microsoft.Azure.CreateUIDef`, version `0.1.2-preview`, 34 outputs mapping to real chart paths, each with a `manifest.yaml` configurationSettings entry.
- `schema.yaml` (x-google-marketplace v2) + the GCP overlay + the Azure manifest parse; all value paths cross-checked against `values.schema.json`.
- BYOL-clean: no marketplace metering or entitlement API anywhere. The OpenSteward license is a file verified offline (see above).

### Follow-ups that need a cloud account

These checks cannot run from the repository, so they wait for the next listing submission:

- **Azure:** render `createUiDefinition.json` in the [Create UI Definition Sandbox](https://portal.azure.com/#blade/Microsoft_Azure_CreateUIDef/SandboxBlade) and confirm the **License** step: an empty secret name passes, the key field appears once a name is entered, and the outputs carry `license.existingSecret` / `license.secretKey`. Then install from the preview offer with a license Secret and check that the integration-server log reports the license.
- **GCP:** `mpdev verify` and `mpdev install` with `"license.existingSecret": "opensteward-license"` (gcp/README.md step 4), and confirm integration-server mounts the Secret at `/etc/opensteward/license`.
