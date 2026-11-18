# Provider + Terraform version pins.
#
# REFERENCE / EXAMPLE infrastructure-as-code. Versions are pinned with the
# pessimistic operator (~>) so `terraform init` is reproducible while still
# picking up patch releases. Bump deliberately and re-run `terraform plan`.
terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    # google + google-beta are used together: a handful of resources here
    # (notably some Cloud SQL / networking knobs) are only GA-stable on the
    # beta provider, and Workload Identity wiring is cleaner with both present.
    google = {
      source  = "hashicorp/google"
      version = "~> 6.12"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
