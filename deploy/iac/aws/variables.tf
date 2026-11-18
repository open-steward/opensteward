# Inputs. Sensible lean defaults — an operator overrides via terraform.tfvars.
# Anything that ties back to the Helm overlay
# (deploy/helm/overlays/aws-values.yaml) is called out in its description.

variable "region" {
  description = "AWS region to deploy into. Becomes the overlay's <REGION>."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for all named resources (cluster, VPC, RDS, IAM)."
  type        = string
  default     = "opensteward"
}

variable "environment" {
  description = "Environment tag (dev | staging | prod). Cosmetic; drives tags only."
  type        = string
  default     = "prod"
}

variable "tags" {
  description = "Extra tags merged onto every resource."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR for the VPC. /16 leaves room for public + private + db subnets."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of AZs to spread subnets across. Multi-AZ RDS needs >= 2."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4."
  }
}

# ---------------------------------------------------------------------------
# EKS
# ---------------------------------------------------------------------------

variable "kubernetes_version" {
  description = "EKS control-plane / node minor version. Keep current; bump deliberately."
  type        = string
  default     = "1.33"
}

variable "node_instance_types" {
  description = "Instance types for the managed node group. Lean general-purpose default."
  type        = list(string)
  default     = ["m6i.large"]
}

variable "node_desired_size" {
  description = "Desired worker node count."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum worker node count."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum worker node count (headroom for HPA + cluster-autoscaler)."
  type        = number
  default     = 5
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT for the managed node group."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "cluster_endpoint_public_access" {
  description = "Expose the EKS API endpoint publicly. Keep true for laptop kubectl; lock down with the CIDRs below."
  type        = bool
  default     = true
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Tighten for prod."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ---------------------------------------------------------------------------
# Workload identity contract — must match the Helm release.
# The chart's ServiceAccount is named "<release>-opensteward" and lives in the
# release namespace. IRSA trust binds to system:serviceaccount:<ns>:<ksa>, so
# these MUST equal `helm install <release> --namespace <namespace>`.
# ---------------------------------------------------------------------------

variable "k8s_namespace" {
  description = "Kubernetes namespace the chart is installed into (helm --namespace)."
  type        = string
  default     = "opensteward"
}

variable "helm_release_name" {
  description = "Helm release name. The chart ServiceAccount becomes '<release>-opensteward'."
  type        = string
  default     = "os"
}

# ---------------------------------------------------------------------------
# RDS for PostgreSQL
# ---------------------------------------------------------------------------

variable "db_name" {
  description = "Initial database name created on the instance."
  type        = string
  default     = "opensteward"
}

variable "db_username" {
  description = "Master username for the PostgreSQL instance."
  type        = string
  default     = "opensteward"
}

variable "db_engine_version" {
  description = "PostgreSQL major.minor version for RDS."
  type        = string
  default     = "16.4"
}

variable "db_instance_class" {
  description = "RDS instance class. Lean default; size up for production load."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Initial storage (GiB). gp3, autoscales up to db_max_allocated_storage."
  type        = number
  default     = 50
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling (GiB)."
  type        = number
  default     = 200
}

variable "db_multi_az" {
  description = "Run RDS Multi-AZ (standby in a second AZ). Recommended for prod; doubles cost."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Block `terraform destroy` from deleting the database. Enable in prod."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated backup retention window (days)."
  type        = number
  default     = 7
}
