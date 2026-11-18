# Memorystore for Redis — OPTIONAL. The overlay's `redis.url` points at
# redis://<MEMORYSTORE_IP>:6379. Disabled by default (enable_memorystore=false)
# so the lean trial doesn't pay for Redis; flip the flag to provision it.
#
# Auth/TLS: this lean example leaves AUTH and in-transit encryption off, so the
# overlay uses the redis:// scheme. For production turn on auth_enabled +
# transit_encryption_mode and switch the overlay to rediss:// (see README).

resource "google_redis_instance" "this" {
  count          = var.enable_memorystore ? 1 : 0
  name           = "${var.name_prefix}-redis"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb

  # google_redis_instance has no "region" argument — it places the instance with
  # a zonal location_id and inherits its region from that zone. We pin it to the
  # "-a" zone of the configured region (every GA region exposes an -a zone). For
  # STANDARD_HA you would also set alternative_location_id to a second zone.
  location_id = "${var.region}-a"

  # Same VPC as the cluster so nodes reach it on the private IP. DIRECT_PEERING
  # needs only the authorized network (no Private Services Access dependency), so
  # Redis works whether or not Cloud SQL private IP is enabled.
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "DIRECT_PEERING"

  redis_version = "REDIS_7_2"
  labels        = var.labels

  depends_on = [google_project_service.enabled]
}
