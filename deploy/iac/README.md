# Reference infrastructure-as-code

**Examples, not the product.** Each directory provisions the cloud-side pieces the
matching Helm overlay (`deploy/helm/overlays/<cloud>-values.yaml`) expects: a managed
Kubernetes cluster, managed PostgreSQL, the app-secrets entry in the cloud secret
store, and the workload-identity / IRSA trust that lets the chart ServiceAccount read
it. Adapt them to your standards (state backend, networking, sizing) before any real
use.

| dir | tool | provisions |
|---|---|---|
| [`aws/`](aws) | Terraform/OpenTofu | EKS + node group, RDS Postgres, Secrets Manager secret, IRSA role for ESO |
| [`azure/`](azure) | Bicep | AKS (OIDC + Workload Identity + app-routing), Postgres Flexible Server, Key Vault + secret, user-assigned identity + federated credential |
| [`gcp/`](gcp) | Terraform/OpenTofu | GKE (Workload Identity), Cloud SQL Postgres, Secret Manager secret, Google SA + WI binding |

Each validates cleanly with `tofu validate` / `bicep build`. **In-cluster operators**
(External Secrets Operator, the ingress controller, cert-manager) are prerequisites the
IaC does *not* install — see the overlay README.

## The contract (IaC ↔ overlay)

All three create exactly what the overlay references:

- **App secrets** — ONE cloud secret (`opensteward/app-secrets` on AWS,
  `opensteward-app-secrets` on Azure/GCP) whose value is a JSON object with
  `JWT_SECRET` / `SESSION_SECRET` / `STORE_SECRET` (+ optional `ADMIN_SECRET`). ESO
  syncs it into the K8s Secret the pods read.
- **Identity** — the workload identity bound to `system:serviceaccount:<namespace>:<release>-opensteward`
  (default `opensteward` / `os-opensteward`), output as the role ARN / client-id / GSA
  email you paste into `serviceAccount.annotations`.
- **Database** — managed Postgres; the IaC outputs a `DATABASE_URL` for the K8s Secret
  `opensteward-db` (key `DATABASE_URL`).

## ⚠️ `STORE_SECRET`

`STORE_SECRET` encrypts data at rest — **changing it orphans all encrypted data.** Each
stack generates it once and guards it against silent rotation (Terraform
`ignore_changes`; Bicep `@minLength(1)` + a persisted secret-state file). A
`terraform destroy` / resource-group delete *does* remove it — back it up out-of-band
(password manager / pipeline secret) before tearing infra down.

## Apply order

1. `cd <cloud>` → fill `*.tfvars.example` → `*.bicepparam` (and read the per-cloud README).
2. Provision: `tofu init && tofu apply` (AWS/GCP) or `./deploy.sh` (Azure).
3. Install the in-cluster operators (ESO, ingress controller, cert-manager).
4. Paste the outputs into your overlay's `<PLACEHOLDER>`s and `helm install`.
