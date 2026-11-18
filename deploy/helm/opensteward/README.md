# OpenSteward Helm chart

Deploys OpenSteward into a customer-controlled Kubernetes cluster (AWS/Azure/GCP
or on-prem) as five services behind one ingress. Runs on **SQLite** (single-node
trial) or **external Postgres** (HA) from the same chart — flip `database.mode`.

```
admin (UI)  docs-server  webhook-gateway  integration-server   ← exposable
                         admin-api                              ← ClusterIP only
```

## Prerequisites

- Kubernetes >= 1.25, Helm >= 3.12.
- An ingress controller (e.g. ingress-nginx) if you set `ingress.enabled=true`.
- **Postgres mode:** a reachable PostgreSQL 14+ and a Secret holding `DATABASE_URL`.
- **Postgres mode, integration-server > 1 replica:** a reachable Redis (shared
  rate-limit budget) — see [Redis](#redis).
- Pull access to `ghcr.io/open-steward/*` (set `image.pullSecrets` for private
  pulls).

## Quick start — trial (SQLite, in-chart secrets)

SQLite mode gives each stateful service its own RWO PVC and pins it to a single
replica (one SQLite writer). Good for evaluation, **not HA**.

```bash
helm install os deploy/helm/opensteward \
  --set database.mode=sqlite \
  --set secrets.source=plain \
  --set secrets.plain.jwtSecret="$(openssl rand -base64 32)" \
  --set secrets.plain.sessionSecret="$(openssl rand -base64 32)" \
  --set secrets.plain.storeSecret="$(openssl rand -base64 32)" \
  --set publicUrls.adminUi=https://admin.example.com \
  --set publicUrls.adminApi=https://admin-api.example.com \
  --set ingress.hosts[0].host=admin.example.com \
  --set ingress.hosts[0].service=admin
```

> `secrets.source=plain` renders the secrets into Helm release history. Fine for a
> trial; use `existingSecret` for anything real.

## Production — Postgres (HA) + external secret

```bash
# 1. Secret with the connection string (managed RDS / Cloud SQL / Flexible Server)
kubectl create secret generic opensteward-db \
  --from-literal=DATABASE_URL='postgres://user:pass@host:5432/opensteward?sslmode=require'

# 2. Secret with the app secrets (>=32 chars, real entropy each)
kubectl create secret generic opensteward-secrets \
  --from-literal=JWT_SECRET=...   --from-literal=SESSION_SECRET=... \
  --from-literal=STORE_SECRET=... --from-literal=ADMIN_SECRET=...

helm install os deploy/helm/opensteward \
  --set database.mode=postgres \
  --set database.external.existingSecret=opensteward-db \
  --set secrets.source=existingSecret \
  --set secrets.existingSecret=opensteward-secrets \
  --set redis.enabled=true --set redis.url=redis://opensteward-redis:6379 \
  --set services.integration-server.autoscaling.enabled=true \
  --set podDisruptionBudget.enabled=true \
  -f my-ingress-values.yaml
```

In Postgres mode the three stateful services become stateless (no PVC,
RollingUpdate, scalable), `DATABASE_URL` is injected from the Secret, and HPAs/PDBs
become available.

## `database.mode`

| | `sqlite` (default) | `postgres` |
|---|---|---|
| admin-api / webhook-gateway / integration-server | 1 replica, `Recreate`, RWO PVC at `/app/apps/<svc>/data` | stateless, RollingUpdate, no PVC |
| admin / docs-server | stateless | stateless |
| HPA / PDB | off (single writer) | available |
| State | on the PVC | external Postgres |
| HA | no | yes |

`STORE_SECRET` encrypts data at rest; ciphertext is byte-identical across both
backends, but there is **no in-place SQLite→Postgres data copy** — each backend is
a clean boot.

docs-server needs no volume: its image carries the repository's `docs/` (the
guides, the OpenAPI specs and the platform catalog) at `/app/docs`, so the docs
site, Unified API reference and catalog work as installed. The docs are those of the
image's build; to publish edited docs, rebuild the image or mount your own copy
over `/app/docs`. The admin image likewise carries the platform catalog
(`/app/docs/platforms/platforms.json`) its connection and platform pages read.
Platform logos are never in either image (see
[platform logos](../../../docs/operations/platform-logos.md)).

## Secrets

Pods always `envFrom` one Secret (`<release>-secrets`, or `secrets.existingSecret`)
with `JWT_SECRET`, `SESSION_SECRET`, `STORE_SECRET` and optional `ADMIN_SECRET`.
Because every pod runs `NODE_ENV=production`, `assertSecret()` is **fail-closed**: a
weak or missing secret CrashLoops the pod instead of booting insecurely — intended.

`secrets.source` picks how that Secret is supplied:

| source | what it does | use for |
|---|---|---|
| `existingSecret` | reference an operator-managed Secret (also how sealed-secrets / SOPS land — point at their output) | **production** |
| `externalSecrets` | [External Secrets Operator](https://external-secrets.io) syncs it from AWS Secrets Manager / Azure Key Vault / GCP Secret Manager | production on a cloud |
| `generate` | a pre-install/pre-upgrade hook Job creates + maintains it | one-command trials |
| `plain` | chart renders it from `secrets.plain.*` (lands in release history) | dev only |

### `externalSecrets` (ESO)

ESO must be installed in the cluster. Either reference an existing store
(`secrets.externalSecrets.secretStore.name`/`.kind`) or have the chart render a
`ClusterSecretStore` (`createStore=true` + `provider` + provider block). Store auth
uses the chart ServiceAccount, so set `serviceAccount.annotations` for IRSA /
Workload Identity (the per-cloud overlays do this). Map keys either from one remote
JSON secret (`remoteSecretName`, pulled via `dataFrom`) or one remote secret per key
(`keys.*`). The synced Secret is owned by ESO; pods may CrashLoop until the first
sync completes (`kubectl get externalsecret <release>-secrets`).

### `generate`

The hook Job creates `<release>-secrets` if absent, fills any **missing**
`JWT_SECRET`/`SESSION_SECRET`, and creates `STORE_SECRET` **only when absent** — it
**never overwrites an existing `STORE_SECRET`** (that would orphan every encrypted
value). The Secret is created via `kubectl`, so it is **not** Helm-owned and
`helm uninstall` leaves it (keeping the decryption key). The Job image needs kubectl
+ a shell — override `secrets.generate.image` for locked-down registries.

It also mints a **`BOOTSTRAP_TOKEN`** by default (`secrets.generate.bootstrapToken=true`),
so first-run setup is gated out of the box — the setup wizard asks for it. Read it back
to complete setup:

```bash
kubectl -n <ns> get secret <release>-secrets -o jsonpath='{.data.BOOTSTRAP_TOKEN}' | base64 -d; echo
```

Set `secrets.generate.bootstrapToken=false` for an ungated trial. For the other secret
sources, supply `BOOTSTRAP_TOKEN` yourself (a `secrets.plain.bootstrapToken` value, an
`externalSecrets.keys.bootstrapToken` mapping, or a key in your existing Secret) — omit it
to leave setup ungated. The pods `envFrom` the whole Secret, so admin-api picks it up
automatically. See [first-run setup security](../../docs/security/README.md#41-authentication).

## Rotating `STORE_SECRET`

`STORE_SECRET` encrypts data at rest. Rotating it re-encrypts every encrypted column
under a new key — an **offline, maintenance-window** operation (brief downtime for
the stateful services). Setting `rotation.enabled=true` does two things in one
`helm upgrade`: it **scales the stateful Deployments to 0** (so there are no live
writers) and renders the rotate Job. The Job's init container then **refuses to run
unless every stateful Deployment reads back 0 desired / 0 ready** — a read error
aborts, never passes. So you never hand-scale and never race the upgrade.

```bash
REL=os; NS=default
ENV_SECRET=$REL-opensteward-secrets   # or your secrets.existingSecret

# 1. Put OLD + NEW keys where the Job reads them.
kubectl -n $NS create secret generic opensteward-rotation \
  --from-literal=OLD_STORE_SECRET="$CURRENT" --from-literal=NEW_STORE_SECRET="$NEXT"

# 2. Quiesce + rotate in one upgrade.
#    target=postgres  → one run rotates the whole DB.
#    target=admin-api | integration-server → mounts THAT PVC; run once per service,
#      sequentially (RWO). webhook-gateway holds no encrypted data, so it is not a target.
helm upgrade $REL deploy/helm/opensteward --reuse-values \
  --set rotation.enabled=true --set rotation.target=postgres \
  --set rotation.existingSecret=opensteward-rotation
kubectl -n $NS wait --for=condition=complete \
  job/$REL-opensteward-rotate-store-secret --timeout=600s

# 3. Put the NEW key at its SOURCE OF TRUTH (so it survives the next reconcile):
#    - existingSecret : kubectl patch secret $ENV_SECRET ... (below)
#    - generate       : kubectl patch secret $ENV_SECRET ... (the hook never overwrites it)
#    - externalSecrets: update the cloud store entry; ESO syncs it (do NOT just patch
#                       the K8s Secret — ESO would revert it on the next refresh)
#    - plain          : update secrets.plain.storeSecret and pass it to the upgrade below
kubectl -n $NS patch secret $ENV_SECRET --type merge \
  -p "{\"stringData\":{\"STORE_SECRET\":\"$NEXT\"}}"   # existingSecret / generate only

# 4. Disable rotation → the same upgrade scales the writers back up under the NEW key.
#    (Order matters: the key must be NEW at its source before pods restart.)
helm upgrade $REL deploy/helm/opensteward --reuse-values --set rotation.enabled=false

# 5. Re-issue developer_api_keys + end_user_tokens — they hash STORE_SECRET into
#    their KDF salt, so rotation invalidates them (the tool prints which stores).
```

> The Postgres path has no WAL-style live-writer guard — the writers-at-0 quiesce is
> what makes it safe, so do not bypass step 2. The chart performs offline rotation
> only; there is no online dual-key (zero-downtime) rotation.

## Ingress & admin-api

`ingress.hosts[].service` accepts `admin`, `docs-server`, `webhook-gateway`, or
`integration-server`. **`admin-api` is ClusterIP-only and is never exposed as a whole** —
only the SSO/SCIM paths are published, via `ingress.sso` (see below). Routing it
through `ingress.hosts` is a hard `fail` at template time. The `admin` UI reaches it in-cluster.

TLS terminates at the ingress: either `ingress.tls.certManager` (per-host certs via
a ClusterIssuer) or `ingress.tls.existingSecret` (BYO). The original `Host` is
preserved for custom-domain-per-tenant routing.

### Publishing the SSO/SCIM routes (`ingress.sso`)

IdP callbacks and SCIM clients must reach admin-api from outside the cluster, so the
chart has an opt-in `ingress.sso` block. It never publishes admin-api as a whole. When
enabled it renders:

- a separate Ingress `<fullname>-sso` on `ingress.sso.host` with **Exact** paths
  `/api/sso/<slug>/login`, `/api/sso/<slug>/callback` and `/api/sso/<slug>/acs` for each
  slug, plus a **Prefix** `/scim/v2/` when `scim: true`, all backed by admin-api;
- a NetworkPolicy `<fullname>-allow-sso-ingress` admitting only the `allowFrom` peers to
  admin-api pods on port 3001.

With `ingress.tls.existingSecret`, the SSO host reuses the same secret, so that
certificate must also cover `ingress.sso.host`.

```yaml
ingress:
  enabled: true
  hosts:
    - host: app.example.com
      service: admin
  sso:
    enabled: true
    host: sso.example.com
    slugs: [okta, entra]
    scim: true
    allowFrom:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: ingress-nginx
publicUrls:
  adminApi: https://sso.example.com
```

The render fails with a clear message when `ingress.sso.enabled` is set and:

- `ingress.sso.enabled requires ingress.enabled=true` (`ingress.sso` is a sub-block of the main Ingress, so `ingress.enabled: true` must be set too)
- `ingress.sso.host is required when ingress.sso.enabled`
- `ingress.sso: set at least one slug in ingress.sso.slugs, or scim: true`
- `ingress.sso.allowFrom is required: the NetworkPolicy peers (your ingress controller) allowed to reach admin-api`
- `ingress.sso: set publicUrls.adminApi to <scheme>://<host> (SSO_PUBLIC_BASE_URL)`

Paths are Exact and generated per slug on purpose: that needs no controller-specific
regex annotations, and nothing else under `/api/sso/` (`handoff/exchange`,
`login-options`, `<slug>/ldap-login`) is exposed. `ingress.hosts` still refuses
`admin-api`, and with `ingress.sso.enabled=false` (the default) the render is unchanged.

## Redis

`integration-server` enforces a per-API-key rate-limit budget. That budget is
per-process, so running more than one replica without a shared store would multiply
every client's quota. The chart therefore **hard-fails** if `integration-server`
would run > 1 replica (via `replicas` or autoscaling `maxReplicas`) while
`redis.enabled=false`. Set `redis.enabled=true` + `redis.url`, or pin it to one
replica. (SQLite mode pins it to one replica anyway, so Redis is not required there.)

## Optional: SQL access and embedded Superset (Postgres only)

`analytics.sqlAccess.enabled` wires integration-server's read-only SQL access
settings (`ANALYTICS_ADMIN_DATABASE_URL` from a secret, `ANALYTICS_READ_HOST`,
`ANALYTICS_ROLE_PREFIX`) and, in managed mode, a post-install/upgrade hook that
(re)provisions the masked views. `superset.enabled` adds the official Apache
Superset chart (a dependency, vendored under `charts/` so installs from a
checkout work offline) plus a hook job that connects it to the views, creates
the default dashboard and registers embeddable dashboards with admin-api. Both
**fail to render unless `database.mode=postgres`**; Superset also needs
`analytics.sqlAccess.enabled`, `analytics.superset.publicUrl`,
`superset.extraEnv.OPENSTEWARD_ADMIN_ORIGIN`, and (with NetworkPolicies on)
`analytics.superset.networkPolicy.allowFrom`. See
[docs/deployment/superset.md](../../../docs/deployment/superset.md) and
`ci/ci-superset-values.yaml`. Bumping the Superset chart:
`helm dependency update deploy/helm/opensteward` (commit `Chart.lock` and the
new tarball).

## License

OpenSteward verifies a signed license file offline. With none, it runs in community mode: all current verticals, 1 connection, 1 tenant. Get a free license at https://opensteward.dev/license, then:

```bash
kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key
# a new install:
helm install os <chart> -f my-values.yaml --set license.existingSecret=opensteward-license
# an existing release:
helm upgrade os <chart> --reuse-values --set license.existingSecret=opensteward-license
```

| Value | Default | Meaning |
|---|---|---|
| `license.existingSecret` | `""` | Name of the Secret holding the license (never the license itself: the schema refuses anything but a Secret name). Empty = no license mounted. |
| `license.secretKey` | `license.key` | Key inside that Secret. Set it when ESO, SOPS or sealed-secrets name the key differently. |

The Secret is mounted as a **directory** (never `subPath`), read-only, at `/etc/opensteward/license`, on **integration-server only**: it is the single license authority, and admin-api asks it over HTTP. `OPENSTEWARD_LICENSE_FILE` points into the mount.

The volume is `optional`, so a missing Secret never blocks the pod. If you create the Secret after installing, restart integration-server once.

Renew in place:

```bash
kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

kubelet syncs the Secret within about a minute, and integration-server picks it up without a restart. Replicas may disagree for that minute.

The admin console's License panel needs `ADMIN_SECRET` in the env Secret: `secrets.generate.includeAdminSecret=true`, `secrets.plain.adminSecret`, or your own Secret.

## Hardening

Mirrors `docker-compose.hardening.yml` on every pod: `runAsNonRoot`,
uid/gid/fsGroup `1000`, `readOnlyRootFilesystem: true`,
`allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`,
`seccompProfile: RuntimeDefault`, an `emptyDir` at `/tmp`. A default-deny
NetworkPolicy (`networkPolicy.enabled`) allows only the required service-to-service
and ingress flows.

## Verify the install

```bash
helm test os          # curls /health on all five services
kubectl get deploy -l app.kubernetes.io/part-of=opensteward
```

Verify an image signature (published by the images workflow, keyless via GitHub OIDC):

```bash
cosign verify ghcr.io/open-steward/integration-server:<appVersion> \
  --certificate-identity-regexp 'https://github.com/open-steward/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Values

`values.yaml` is documented inline and `values.schema.json` validates every install
(it rejects, e.g., `nodeEnv != production` and `admin-api` in an ingress host). The
`ci/` directory holds the SQLite and Postgres fixtures used by `helm lint` /
`helm template` / `kubeconform` in CI.
