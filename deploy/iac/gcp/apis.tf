# Enable the Google APIs this stack depends on. `disable_on_destroy = false`
# so tearing down the example doesn't disable services other workloads in the
# project might rely on.
locals {
  required_apis = [
    "compute.googleapis.com",
    "container.googleapis.com",         # GKE
    "sqladmin.googleapis.com",          # Cloud SQL
    "secretmanager.googleapis.com",     # Secret Manager
    "servicenetworking.googleapis.com", # Private Services Access (SQL private IP)
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",   # Workload Identity token exchange
    "redis.googleapis.com",            # Memorystore (only used if enabled)
    "artifactregistry.googleapis.com", # image pulls
  ]
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.required_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
