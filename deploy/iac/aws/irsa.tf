# IRSA role the chart ServiceAccount assumes (overlay:
# serviceAccount.annotations."eks.amazonaws.com/role-arn").
#
# Trust: the EKS OIDC provider, scoped to EXACTLY the chart's KSA
# (system:serviceaccount:<namespace>:<release>-opensteward). External Secrets
# Operator runs as that SA and calls secretsmanager:GetSecretValue, so the
# policy is least-privilege: read-only, only on the two secrets this stack
# creates (app secrets + db credentials).

data "aws_iam_policy_document" "eso_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    # Bind to this exact ServiceAccount (sub) ...
    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = [local.ksa_subject]
    }

    # ... and require the standard STS audience.
    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eso" {
  name               = local.irsa_role_name # "opensteward-eso" — matches the overlay
  description        = "IRSA role for OpenSteward External Secrets Operator (read app + db secrets)"
  assume_role_policy = data.aws_iam_policy_document.eso_trust.json

  tags = local.tags
}

data "aws_iam_policy_document" "eso_secrets_read" {
  statement {
    sid    = "ReadOpenStewardSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    # Only the two secrets this stack owns. ESO needs nothing else.
    resources = [
      aws_secretsmanager_secret.app.arn,
      aws_secretsmanager_secret.db.arn,
    ]
  }
}

resource "aws_iam_role_policy" "eso_secrets_read" {
  name   = "opensteward-eso-secrets-read"
  role   = aws_iam_role.eso.id
  policy = data.aws_iam_policy_document.eso_secrets_read.json
}
