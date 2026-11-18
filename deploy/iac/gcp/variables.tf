# Input variables for the OpenSteward GCP/GKE reference stack.
#
# Defaults are "lean" — small enough to stand up a trial cheaply, sized so an
# operator can scale up by editing a couple of values. Everything an operator
# must adapt has a description; secrets are NEVER hardcoded here.

############################
# Project / location
############################

variable "project_id" {
  type        = string
  description = "GCP project ID that will own every resource in this stack."
}

variable "region" {
  type        = string
  description = "Region for the regional GKE cluster, Cloud SQL, and Memorystore."
  default     = "us-central1"
}

variable "name_prefix" {
  type        = string
  description = "Prefix applied to resource names (cluster, SQL instance, etc.)."
  default     = "opensteward"
}

############################
# Helm release / chart coupling (CONSISTENCY CONTRACT)
############################
# The chart runs under a Kubernetes ServiceAccount named
# "<release>-opensteward" in `namespace`. Workload Identity binds the Google
# service account to system:serviceaccount:<namespace>:<ksa>. These two vars
# MUST match how you run `helm install`.

variable "namespace" {
  type        = string
  description = "Kubernetes namespace the OpenSteward chart is installed into."
  default     = "opensteward"
}

variable "helm_release_name" {
  type        = string
  description = <<-EOT
    Helm release name. The chart derives its KSA as "<release>-opensteward",
    so release "os" => KSA "os-opensteward". Keep this in sync with the
    `helm install <release> ...` you run.
  EOT
  default     = "os"
}

############################
# GKE cluster + node pool (lean defaults)
############################

variable "kubernetes_version_prefix" {
  type        = string
  description = "Release-channel version prefix for the cluster (e.g. \"1.30.\"). Empty = channel default."
  default     = ""
}

variable "release_channel" {
  type        = string
  description = "GKE release channel: RAPID, REGULAR, or STABLE."
  default     = "REGULAR"
}

variable "node_machine_type" {
  type        = string
  description = "Machine type for the primary node pool. e2-standard-4 fits a small prod footprint."
  default     = "e2-standard-4"
}

variable "node_count" {
  type        = number
  description = "Initial nodes per zone in the node pool (regional cluster => x number of zones)."
  default     = 1
}

variable "node_min_count" {
  type        = number
  description = "Autoscaling minimum nodes per zone."
  default     = 1
}

variable "node_max_count" {
  type        = number
  description = "Autoscaling maximum nodes per zone."
  default     = 3
}

variable "node_disk_size_gb" {
  type        = number
  description = "Boot disk size per node, GiB."
  default     = 50
}

variable "node_disk_type" {
  type        = string
  description = "Boot disk type for nodes (pd-standard | pd-balanced | pd-ssd)."
  default     = "pd-balanced"
}

############################
# Networking
############################

variable "subnet_cidr" {
  type        = string
  description = "Primary CIDR for the cluster subnet (nodes)."
  default     = "10.10.0.0/20"
}

variable "pods_cidr" {
  type        = string
  description = "Secondary range for Pods (GKE alias IPs)."
  default     = "10.20.0.0/16"
}

variable "services_cidr" {
  type        = string
  description = "Secondary range for Services (ClusterIPs)."
  default     = "10.30.0.0/20"
}

variable "master_ipv4_cidr_block" {
  type        = string
  description = "/28 reserved for the GKE control plane (private cluster)."
  default     = "172.16.0.0/28"
}

variable "enable_private_nodes" {
  type        = bool
  description = "Give nodes private IPs only (egress via Cloud NAT). Recommended."
  default     = true
}

############################
# Cloud SQL (PostgreSQL)
############################

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier. db-custom-1-3840 = 1 vCPU / 3.75 GiB (lean)."
  default     = "db-custom-1-3840"
}

variable "db_version" {
  type        = string
  description = "Cloud SQL Postgres engine version (e.g. POSTGRES_16)."
  default     = "POSTGRES_16"
}

variable "db_name" {
  type        = string
  description = "Application database created inside the instance."
  default     = "opensteward"
}

variable "db_user" {
  type        = string
  description = "Application database user."
  default     = "opensteward"
}

variable "db_disk_size_gb" {
  type        = number
  description = "Initial Cloud SQL data-disk size, GiB (autoresizes upward)."
  default     = 20
}

variable "db_availability_type" {
  type        = string
  description = "ZONAL (single zone, lean) or REGIONAL (HA failover)."
  default     = "ZONAL"
}

variable "db_deletion_protection" {
  type        = bool
  description = "Block `terraform destroy` from dropping the SQL instance. Leave true in prod."
  default     = true
}

variable "use_private_ip" {
  type        = bool
  description = <<-EOT
    Prefer a private IP for Cloud SQL (reachable in-cluster via VPC peering, no
    proxy). If false the instance gets only the Cloud SQL connection name and you
    must run the Cloud SQL Auth Proxy as a sidecar (see README).
  EOT
  default     = true
}

############################
# Memorystore (Redis) — optional convenience
############################

variable "enable_memorystore" {
  type        = bool
  description = "Provision a Memorystore (Redis) instance for the overlay's redis.url."
  default     = false
}

variable "redis_tier" {
  type        = string
  description = "Memorystore tier: BASIC (no HA) or STANDARD_HA."
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  type        = number
  description = "Memorystore capacity, GiB."
  default     = 1
}

############################
# Secret Manager / Workload Identity
############################

variable "app_secret_name" {
  type        = string
  description = <<-EOT
    Secret Manager secret ID holding the app-secrets JSON. MUST match the
    overlay's secrets.externalSecrets.remoteSecretName.
  EOT
  default     = "opensteward-app-secrets"
}

variable "eso_gsa_id" {
  type        = string
  description = <<-EOT
    Google service account ID (the part before @). MUST match the overlay's
    serviceAccount.annotations iam.gke.io/gcp-service-account local part.
  EOT
  default     = "opensteward-eso"
}

variable "include_admin_secret" {
  type        = bool
  description = "Also generate an ADMIN_SECRET key inside the app-secrets JSON."
  default     = true
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to labelable resources."
  default = {
    app        = "opensteward"
    managed-by = "terraform"
  }
}
