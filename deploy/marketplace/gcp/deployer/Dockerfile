# =============================================================================
# OpenSteward — Google Cloud Marketplace deployer image (Helm flavor)
# =============================================================================
# Wraps the OpenSteward Helm chart so Marketplace / mpdev can install it. The
# base image (cloud-marketplace-tools/k8s/deployer_helm) ships the deploy entry
# point that:
#   1. reads /data/schema.yaml,
#   2. turns the operator's deploy-form answers into Helm `--set` flags,
#   3. runs `helm template` on the chart in /data/chart/<name>, and
#   4. applies the manifests plus the Application CR into the namespace.
#
# Expected layout consumed by the base image:
#   /data/schema.yaml                      # the Marketplace schema (UI → values)
#   /data/chart/<chart-name>               # the wrapped Helm chart directory
#   /data/chart/<chart-name>/values.yaml   # chart defaults (overlaid by us)
#
# We layer the GCP Marketplace overlay onto the chart's values.yaml at build
# time so Postgres/HA + External Secrets + ingress-nginx are the baseline, and
# the deploy form (schema.yaml) only overrides environment-specific fields.
#
# BUILD CONTEXT: the repo root (so the chart path resolves). Example:
#   docker build -f deploy/marketplace/gcp/deployer/Dockerfile \
#     -t <AR_HOST>/<PROJECT>/opensteward/deployer:0.1.0 .
#
# Pin the base image by digest in CI (see README). Tag shown for readability.
# =============================================================================

FROM gcr.io/cloud-marketplace-tools/k8s/deployer_helm:0.13.5

# --- 1. The Helm chart -------------------------------------------------------
# Copied verbatim. The chart name (Chart.yaml: name=opensteward) must match the
# directory under /data/chart, so we copy into /data/chart/opensteward.
COPY deploy/helm/opensteward /data/chart/opensteward

# --- 2. The GCP Marketplace overlay ------------------------------------------
# Bake the GCP overlay defaults (Postgres/HA, ESO→Secret Manager, ingress-nginx
# + cert-manager, HA autoscaling) UNDER the schema-driven `--set` values.
#
# IMPORTANT: the deployer_helm base image renders the chart using ONLY the
# chart's own values.yaml plus the schema-derived `--set` flags — there is NO
# supported "extra values file" / APP_VALUES_FILE mechanism. So we must merge the
# overlay INTO the chart's values.yaml at build time. We deep-merge with the
# python3 + PyYAML already present in the base image (ubuntu:22.04 base).
#
# Effective merge precedence at template time becomes:
#   chart values.yaml  <  this overlay (merged into values.yaml)  <  --set (form)
COPY deploy/marketplace/gcp/overlay-values.yaml /tmp/marketplace-gcp-values.yaml

RUN python3 - <<'PY'
import yaml

chart_path = "/data/chart/opensteward/values.yaml"
overlay_path = "/tmp/marketplace-gcp-values.yaml"

def deep_merge(base, over):
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(base.get(k), v) if k in base else v
        return out
    return over

with open(chart_path) as f:
    base = yaml.safe_load(f) or {}
with open(overlay_path) as f:
    over = yaml.safe_load(f) or {}

merged = deep_merge(base, over)
with open(chart_path, "w") as f:
    yaml.safe_dump(merged, f, default_flow_style=False, sort_keys=False)
PY

# --- 3. The Marketplace schema -----------------------------------------------
# Drives the deploy form and the image/value bindings. Must live at /data.
COPY deploy/marketplace/gcp/schema.yaml /data/schema.yaml

# The base image already declares the entrypoint (the deploy/test scripts); we
# only supply data. Do not override ENTRYPOINT/CMD.
