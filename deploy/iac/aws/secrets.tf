# App + DB secrets in AWS Secrets Manager.
#
# Two secrets:
#   1. opensteward/app-secrets  — JSON { JWT_SECRET, SESSION_SECRET, STORE_SECRET }
#      The overlay points secrets.externalSecrets.remoteSecretName here; ESO
#      syncs it into the in-cluster Secret the pods envFrom.
#   2. <prefix>/db-credentials   — JSON DB connection bits + a ready DATABASE_URL.
#      The operator (or ESO) turns this into the K8s secret `opensteward-db`.
#
# !!! STORE_SECRET WARNING !!!
# STORE_SECRET encrypts application data AT REST. It is generated ONCE here and
# MUST NEVER change — rotating it makes existing encrypted data unrecoverable.
# The aws_secretsmanager_secret_version below has `ignore_changes` on the whole
# secret_string so a later `terraform apply` can never silently rotate it. If
# you must rotate JWT_SECRET/SESSION_SECRET, do it out-of-band (and understand
# STORE_SECRET must be preserved verbatim).

# --- App secret values (generated once) ------------------------------------

resource "random_password" "jwt_secret" {
  length  = 48
  special = false # base62-ish; safe in JSON / env without escaping
}

resource "random_password" "session_secret" {
  length  = 48
  special = false
}

# STORE_SECRET: data-at-rest key. Generate once; never rotate. The keeper makes
# this intent explicit — nothing here can trigger a regenerate.
resource "random_password" "store_secret" {
  length  = 48
  special = false

  lifecycle {
    ignore_changes = all
  }
}

resource "aws_secretsmanager_secret" "app" {
  name        = local.app_secrets_name
  description = "OpenSteward app secrets (JWT/SESSION/STORE). Consumed by ESO via the chart ClusterSecretStore."

  # Allow re-create shortly after destroy in non-prod (avoids the 7-30 day
  # recovery-window block during teardown/rebuild cycles).
  recovery_window_in_days = 0

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    JWT_SECRET     = random_password.jwt_secret.result
    SESSION_SECRET = random_password.session_secret.result
    STORE_SECRET   = random_password.store_secret.result
    # ADMIN_SECRET is optional — add it here if you bootstrap an admin token.
  })

  lifecycle {
    # Never let a re-apply rotate STORE_SECRET (or the others). Manage rotation
    # out-of-band if ever needed. This is the load-bearing safety on the whole
    # JSON blob — see the STORE_SECRET warning at the top of this file.
    ignore_changes = [secret_string]
  }
}

# --- DB credentials secret -------------------------------------------------

resource "random_password" "db" {
  length  = 32
  special = false # keep the password URL-safe for DATABASE_URL

  lifecycle {
    ignore_changes = all # password is baked into RDS + DATABASE_URL; don't churn it
  }
}

locals {
  # postgresql://user:pass@host:5432/dbname  — what the chart expects as
  # DATABASE_URL. Host comes from RDS; sslmode=require enforces TLS to RDS.
  database_url = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    var.db_username,
    random_password.db.result,
    module.rds.db_instance_endpoint, # host:port
    var.db_name,
  )
}

resource "aws_secretsmanager_secret" "db" {
  name        = "${var.name_prefix}/db-credentials"
  description = "OpenSteward RDS credentials + DATABASE_URL. Source for the K8s 'opensteward-db' secret."

  recovery_window_in_days = 0

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  secret_string = jsonencode({
    username     = var.db_username
    password     = random_password.db.result
    host         = module.rds.db_instance_address
    port         = 5432
    dbname       = var.db_name
    DATABASE_URL = local.database_url
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
