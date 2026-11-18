# Provider + Terraform version pins.
#
# Reference IaC: pin everything so a future `terraform init` is reproducible.
# Bump deliberately, not implicitly. Versions chosen against the
# terraform-aws-modules used in this stack (eks ~> 20, vpc ~> 5, rds ~> 6).

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}
