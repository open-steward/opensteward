# Shared locals + account/identity lookups.

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  cluster_name = "${var.name_prefix}-eks"
  account_id   = data.aws_caller_identity.current.account_id

  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # The Kubernetes ServiceAccount the chart renders (serviceAccount.name defaults
  # to "<release>-opensteward"). IRSA trust + the ESO ClusterSecretStore bind to
  # this exact principal. Keep in lockstep with the overlay.
  ksa_name       = "${var.helm_release_name}-opensteward"
  ksa_subject    = "system:serviceaccount:${var.k8s_namespace}:${local.ksa_name}"
  irsa_role_name = "opensteward-eso" # overlay: eks.amazonaws.com/role-arn

  # Secrets Manager secret names. app_secrets_name is the overlay's
  # secrets.externalSecrets.remoteSecretName.
  app_secrets_name = "opensteward/app-secrets"

  tags = merge(
    {
      Project            = "opensteward"
      Environment        = var.environment
      ManagedBy          = "terraform"
      "terraform-module" = "deploy/iac/aws"
    },
    var.tags,
  )
}
