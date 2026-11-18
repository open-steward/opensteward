# Secret Manager app-secrets + the Workload-Identity-bound service account ESO
# uses to read them.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │  STORE_SECRET WARNING — READ THIS                                          │
# │  STORE_SECRET encrypts application data AT REST. It is generated ONCE and  │
# │  must NEVER change: rotating it makes existing encrypted data unreadable.  │
# │  The random_password below has `lifecycle { ignore_changes = all }` and    │
# │  the secret VERSION ignores changes to its payload, so a later             │
# │  `terraform apply` (or taint/replace of other keys) will NOT silently      │
# │  rotate it. A `terraform destroy` followed by re-apply DOES create a new   │
# │  one — treat destroy of this secret as destroying your data key.           │
# └──────────────────────────────────────────────────────────────────────────┘

############################
# Random app-secret material (never hardcoded)
############################

# JWT_SECRET / SESSION_SECRET / ADMIN_SECRET may be rotated later; STORE_SECRET
# must not. They all need >=32 chars of real entropy (chart CrashLoops otherwise).

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "session_secret" {
  length  = 48
  special = false
}

resource "random_password" "admin_secret" {
  count   = var.include_admin_secret ? 1 : 0
  length  = 48
  special = false
}

resource "random_password" "store_secret" {
  length  = 48
  special = false

  # STORE_SECRET is a data-encryption key: pin it for the life of the resource.
  lifecycle {
    ignore_changes = all
  }
}

locals {
  # One JSON object: exactly the keys ESO extracts (dataFrom.extract) and the
  # pods envFrom. Keys must match the chart's ExternalSecret expectations.
  app_secrets_json = jsonencode(merge(
    {
      JWT_SECRET     = random_password.jwt_secret.result
      SESSION_SECRET = random_password.session_secret.result
      STORE_SECRET   = random_password.store_secret.result
    },
    var.include_admin_secret ? { ADMIN_SECRET = random_password.admin_secret[0].result } : {},
  ))
}

############################
# Secret Manager secret + version
############################

resource "google_secret_manager_secret" "app_secrets" {
  secret_id = var.app_secret_name # MUST equal overlay remoteSecretName
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "app_secrets" {
  secret      = google_secret_manager_secret.app_secrets.id
  secret_data = local.app_secrets_json

  # Don't let a re-apply churn the payload (which would rotate STORE_SECRET).
  # To intentionally rotate the rotatable keys, add a new version out-of-band.
  lifecycle {
    ignore_changes = [secret_data]
  }
}

############################
# ESO Google service account + Workload Identity binding
############################

# The Google SA whose email goes into the overlay's
# serviceAccount.annotations[iam.gke.io/gcp-service-account].
resource "google_service_account" "eso" {
  account_id   = var.eso_gsa_id # MUST equal overlay annotation local part
  display_name = "OpenSteward External Secrets reader"
  project      = var.project_id
}

# Grant the SA read access to the app-secrets secret only (least privilege).
resource "google_secret_manager_secret_iam_member" "eso_accessor" {
  secret_id = google_secret_manager_secret.app_secrets.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.eso.email}"
}

# Workload Identity: let the chart KSA impersonate the ESO Google SA.
# The principal is system:serviceaccount:<namespace>:<ksa> projected as
# serviceAccount:<project>.svc.id.goog[<namespace>/<ksa>].
#
# KSA name is "<release>-opensteward" per the chart (CONSISTENCY CONTRACT).
locals {
  ksa_name                 = "${var.helm_release_name}-opensteward"
  workload_identity_member = "serviceAccount:${var.project_id}.svc.id.goog[${var.namespace}/${local.ksa_name}]"
}

resource "google_service_account_iam_member" "eso_wi" {
  service_account_id = google_service_account.eso.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.workload_identity_member
}
