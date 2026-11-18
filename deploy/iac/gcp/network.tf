# VPC, subnet (with GKE secondary ranges), Cloud NAT, and Private Services
# Access used by Cloud SQL's private IP.
#
# A dedicated VPC keeps the example self-contained; an operator with an existing
# network would drop this file and feed in their own subnet + secondary ranges.

locals {
  network_name = "${var.name_prefix}-vpc"
  subnet_name  = "${var.name_prefix}-subnet"
  pods_range   = "${var.name_prefix}-pods"
  svc_range    = "${var.name_prefix}-services"
}

resource "google_compute_network" "vpc" {
  name                    = local.network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "subnet" {
  name          = local.subnet_name
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id

  # Secondary ranges GKE consumes for VPC-native (alias IP) Pods/Services.
  secondary_ip_range {
    range_name    = local.pods_range
    ip_cidr_range = var.pods_cidr
  }
  secondary_ip_range {
    range_name    = local.svc_range
    ip_cidr_range = var.services_cidr
  }

  # Required for Private Google Access so private nodes reach Google APIs
  # (Secret Manager, Artifact Registry, ...) without public IPs.
  private_ip_google_access = true
}

############################
# Cloud NAT — egress for private nodes (image pulls, webhooks, OAuth, ...).
############################

resource "google_compute_router" "router" {
  count   = var.enable_private_nodes ? 1 : 0
  name    = "${var.name_prefix}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  count                              = var.enable_private_nodes ? 1 : 0
  name                               = "${var.name_prefix}-nat"
  router                             = google_compute_router.router[0].name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = false
    filter = "ERRORS_ONLY"
  }
}

############################
# Private Services Access — VPC peering range Cloud SQL's private IP lives in.
# Only created when use_private_ip = true.
############################

resource "google_compute_global_address" "private_service_range" {
  count         = var.use_private_ip ? 1 : 0
  name          = "${var.name_prefix}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  count                   = var.use_private_ip ? 1 : 0
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range[0].name]
}
