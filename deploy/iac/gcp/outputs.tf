# Outputs — every value the operator pastes into deploy/helm/overlays/gcp-values.yaml
# (and the my-secrets-and-hosts.yaml companion). The README maps each one to its
# <PLACEHOLDER>.

############################
# Overlay: secrets.externalSecrets.gcp.*  +  ESO annotation
############################

output "project_id" {
  description = "=> overlay secrets.externalSecrets.gcp.projectID  (<PROJECT_ID>)"
  value       = var.project_id
}

output "cluster_name" {
  description = "=> overlay secrets.externalSecrets.gcp.clusterName  (<CLUSTER_NAME>)"
  value       = google_container_cluster.this.name
}

output "cluster_location" {
  description = "=> overlay secrets.externalSecrets.gcp.clusterLocation  (<REGION_OR_ZONE>). Regional cluster => the region."
  value       = google_container_cluster.this.location
}

output "eso_gsa_email" {
  description = <<-EOT
    Google service account email. Paste into the overlay's
    serviceAccount.annotations[iam.gke.io/gcp-service-account].
  EOT
  value       = google_service_account.eso.email
}

output "app_secret_name" {
  description = "=> overlay secrets.externalSecrets.remoteSecretName. Created in Secret Manager."
  value       = google_secret_manager_secret.app_secrets.secret_id
}

############################
# Identity binding sanity-check (KSA the WI binding targets)
############################

output "kubernetes_service_account" {
  description = "KSA the chart creates and the Workload Identity binding targets: <namespace>/<ksa>."
  value       = "${var.namespace}/${local.ksa_name}"
}

output "workload_identity_member" {
  description = "The IAM member used for the Workload Identity binding (for verification)."
  value       = local.workload_identity_member
}

############################
# Database — drives the opensteward-db Kubernetes secret (DATABASE_URL)
############################

output "cloudsql_connection_name" {
  description = "Cloud SQL connection name (PROJECT:REGION:INSTANCE). Use with the Auth Proxy."
  value       = google_sql_database_instance.this.connection_name
}

output "cloudsql_private_ip" {
  description = "Cloud SQL private IP (empty unless use_private_ip=true)."
  value       = var.use_private_ip ? google_sql_database_instance.this.private_ip_address : ""
}

# DATABASE_URL: built for the private-IP path; with the Auth Proxy the host
# becomes 127.0.0.1:5432 (sidecar) — see README. Sensitive: holds the DB password.
locals {
  # Host:port the app connects to. Private IP path uses the instance IP; the
  # Auth Proxy path uses the loopback the sidecar listens on.
  db_host = var.use_private_ip ? google_sql_database_instance.this.private_ip_address : "127.0.0.1"

  database_url = format(
    "postgres://%s:%s@%s:5432/%s?sslmode=disable",
    google_sql_user.app.name,
    random_password.db.result,
    local.db_host,
    google_sql_database.app.name,
  )
}

output "database_url" {
  description = <<-EOT
    Connection string for the `opensteward-db` Kubernetes secret (key DATABASE_URL).
    For the Auth Proxy, the host is 127.0.0.1:5432 automatically (use_private_ip=false).
    Create the secret:
      kubectl -n <ns> create secret generic opensteward-db \
        --from-literal=DATABASE_URL='<this value>'
  EOT
  value       = local.database_url
  sensitive   = true
}

output "database_password" {
  description = "Generated Cloud SQL password (also embedded in database_url)."
  value       = random_password.db.result
  sensitive   = true
}

############################
# Redis / Memorystore guidance
############################

output "memorystore_host" {
  description = "Memorystore IP (empty unless enable_memorystore=true)."
  value       = var.enable_memorystore ? google_redis_instance.this[0].host : ""
}

output "redis_url" {
  description = <<-EOT
    => overlay redis.url (replaces redis://<MEMORYSTORE_IP>:6379).
    Empty unless enable_memorystore=true. AUTH/TLS off in this lean example, so
    redis:// — enable auth + transit encryption for prod and use rediss://.
  EOT
  value       = var.enable_memorystore ? format("redis://%s:%d", google_redis_instance.this[0].host, google_redis_instance.this[0].port) : ""
}
