# Per-cloud overlays

Pure Helm values files that layer cloud-specific settings on top of the base chart
(`deploy/helm/opensteward`) — **no template changes**. Each puts the chart into
Postgres/HA mode and wires the cloud's ingress, TLS, managed Postgres/Redis, and
**External Secrets Operator** (ESO) provider to that cloud's secret store via the
chart ServiceAccount's workload identity.

```bash
helm install os deploy/helm/opensteward \
  -f deploy/helm/overlays/<cloud>-values.yaml \
  -f my-hosts-and-names.yaml          # your real hosts + secret/identity names
```

Layering a third file (or `--set`) keeps your real values out of git. Every
`<PLACEHOLDER>` in an overlay must be replaced.

## What each overlay sets

| | AWS (`aws-values.yaml`) | Azure (`azure-values.yaml`) | GCP (`gcp-values.yaml`) |
|---|---|---|---|
| Ingress | ALB (`alb`) + ACM TLS | app-routing nginx + cert-manager | ingress-nginx + cert-manager |
| Secret store | Secrets Manager | Key Vault | Secret Manager |
| Workload identity | IRSA (`eks.amazonaws.com/role-arn`) | Workload Identity (`azure.workload.identity/client-id`) | Workload Identity (`iam.gke.io/gcp-service-account`) |
| Managed Postgres | RDS | Postgres Flexible Server | Cloud SQL |
| StorageClass¹ | `gp3` | `managed-csi` | `premium-rwo` |

¹ Only used in `database.mode=sqlite` trials; the overlays run Postgres mode (no PVCs).

## Cluster prerequisites (per overlay)

All three assume these are already installed in the cluster (the reference IaC under
[`deploy/iac/<cloud>`](../../iac) provisions the cloud side — cluster, Postgres,
secret-store entry, and the identity binding — but **not** these in-cluster operators):

- **External Secrets Operator** — the overlays use `secrets.source=externalSecrets`
  with `createStore=true`, so ESO must be running and the chart ServiceAccount must be
  bound (IRSA / Workload Identity) to read the cloud secret.
- **An ingress controller** — AWS Load Balancer Controller (`alb`), AKS app-routing
  (`webapprouting.kubernetes.io`), or ingress-nginx (`nginx`).
- **cert-manager** with a `letsencrypt-prod` ClusterIssuer (Azure/GCP overlays). AWS
  terminates TLS at the ALB via an ACM cert, so it needs no in-cluster cert-manager.

## Secrets layout

Each overlay points ESO at one cloud secret (`opensteward/app-secrets` on AWS,
`opensteward-app-secrets` on Azure/GCP) whose **value is a JSON object** with
`JWT_SECRET`, `SESSION_SECRET`, `STORE_SECRET` (and optionally `ADMIN_SECRET`). ESO
syncs it into the K8s Secret the pods read. The database URL is a separate K8s Secret
`opensteward-db` (key `DATABASE_URL`) — create it from the IaC's Postgres output, or
sync it via a second ExternalSecret.

> **`STORE_SECRET` is the data-at-rest key — generate it once and never rotate it
> casually.** The reference IaC sets `ignore_changes`/stability guards so re-applying
> infra does not silently replace it. To rotate it deliberately, follow the chart
> README's rotation runbook.

## GKE ingress note

The GCP overlay uses ingress-nginx because it works with pure values. The GKE-native
GCE ingress needs container-native LB (NEG) annotations on each Service, which the base
chart does not template.
