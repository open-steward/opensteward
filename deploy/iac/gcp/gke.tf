# Regional GKE cluster with Workload Identity + a lean, autoscaling node pool.
#
# Workload Identity (workload_identity_config + node metadata GKE_METADATA) is
# the mechanism the chart's ClusterSecretStore uses: the ESO controller, running
# as the chart KSA, federates to the `opensteward-eso` Google SA (see iam.tf) to
# read Secret Manager. Without it the gcpsm auth.workloadIdentity block can't work.

locals {
  cluster_name = "${var.name_prefix}-gke"
}

resource "google_container_cluster" "this" {
  name     = local.cluster_name
  location = var.region # regional cluster: control plane + nodes across zones

  # We manage our own node pool below, so remove the default one. GKE requires
  # >=1 node at create time, hence the remove-after-create dance.
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.subnet.id

  # VPC-native cluster wired to the subnet's secondary ranges.
  networking_mode = "VPC_NATIVE"
  ip_allocation_policy {
    cluster_secondary_range_name  = local.pods_range
    services_secondary_range_name = local.svc_range
  }

  release_channel {
    channel = var.release_channel
  }

  # Empty => take the channel default. Otherwise pin a prefix like "1.30.".
  min_master_version = var.kubernetes_version_prefix != "" ? var.kubernetes_version_prefix : null

  # *** Workload Identity *** — required by the overlay.
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Private control plane + (optionally) private nodes. Nodes still reach Google
  # APIs via Private Google Access and the internet via Cloud NAT.
  private_cluster_config {
    enable_private_nodes    = var.enable_private_nodes
    enable_private_endpoint = false # keep the public endpoint so kubectl/helm work from anywhere
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  }

  # Lean add-on footprint. HTTP load balancing stays on for completeness, but the
  # overlay uses ingress-nginx (a PREREQ you install separately), not GCE ingress.
  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
  }

  deletion_protection = false # example stack — let `terraform destroy` work

  resource_labels = var.labels

  depends_on = [google_project_service.enabled]
}

resource "google_container_node_pool" "primary" {
  name     = "${var.name_prefix}-np"
  location = var.region
  cluster  = google_container_cluster.this.name

  initial_node_count = var.node_count

  autoscaling {
    min_node_count = var.node_min_count
    max_node_count = var.node_max_count
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.node_disk_size_gb
    disk_type    = var.node_disk_type

    # Least-privilege node SA scope; real authZ comes from Workload Identity.
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    # GKE_METADATA exposes the Workload Identity metadata server to pods so the
    # KSA->GSA federation works on these nodes.
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = var.labels
    tags   = ["${var.name_prefix}-node"]
  }
}
