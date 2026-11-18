# Everything the operator pastes into deploy/helm/overlays/aws-values.yaml.
# The README maps each output to its <PLACEHOLDER>.

output "cluster_name" {
  description = "EKS cluster name (for `aws eks update-kubeconfig`)."
  value       = module.eks.cluster_name
}

output "region" {
  description = "Deployment region. Overlay: secrets.externalSecrets.aws.region (<REGION>)."
  value       = var.region
}

output "account_id" {
  description = "AWS account ID. Overlay: <ACCOUNT_ID> in the role ARN + ACM ARN."
  value       = local.account_id
}

output "cluster_endpoint" {
  description = "EKS API server endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_oidc_provider_arn" {
  description = "IAM OIDC provider ARN backing IRSA (for additional roles)."
  value       = module.eks.oidc_provider_arn
}

output "eso_irsa_role_arn" {
  description = <<-EOT
    IRSA role ARN for the chart ServiceAccount.
    Overlay: serviceAccount.annotations."eks.amazonaws.com/role-arn".
  EOT
  value       = aws_iam_role.eso.arn
}

output "kubernetes_service_account" {
  description = "The KSA this role trusts (system:serviceaccount:<ns>:<name>). Must equal helm --namespace + release."
  value       = local.ksa_subject
}

output "app_secrets_name" {
  description = "Secrets Manager secret holding the app-secrets JSON. Overlay: secrets.externalSecrets.remoteSecretName."
  value       = aws_secretsmanager_secret.app.name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)."
  value       = module.rds.db_instance_endpoint
}

output "rds_address" {
  description = "RDS PostgreSQL hostname (no port)."
  value       = module.rds.db_instance_address
}

output "db_credentials_secret_name" {
  description = "Secrets Manager secret with DB creds + DATABASE_URL (source for the K8s 'opensteward-db' secret)."
  value       = aws_secretsmanager_secret.db.name
}

# Sensitive: contains the DB password. Read with:
#   terraform output -raw database_url
output "database_url" {
  description = "Full Postgres DATABASE_URL for the K8s secret 'opensteward-db' (key DATABASE_URL)."
  value       = local.database_url
  sensitive   = true
}

output "acm_certificate_arn_guidance" {
  description = "How to fill the overlay's certificate-arn placeholder."
  value       = <<-EOT
    The overlay's ALB terminates TLS and needs an ACM certificate in THIS region
    (${var.region}) covering your ingress hosts (admin.* and api.*).

    This reference does NOT request the cert (DNS validation needs your hosted
    zone / registrar). Create it, then paste its ARN into the overlay's
    alb.ingress.kubernetes.io/certificate-arn.

      aws acm request-certificate \
        --region ${var.region} \
        --domain-name admin.example.com \
        --subject-alternative-names api.example.com admin-api.example.com \
        --validation-method DNS

    Validate via the CNAME records ACM returns, then:
      ARN format -> arn:aws:acm:${var.region}:${local.account_id}:certificate/<CERT_ID>
  EOT
}
