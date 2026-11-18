#!/usr/bin/env bash
# Invariants for the admin SSO/SCIM Ingress. Run locally and in CI.
set -euo pipefail
C="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail() { echo "FAIL: $*"; exit 1; }

# 1. Default install: no admin-api in any Ingress (unchanged behaviour).
helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" > "$T/default.yaml"
if awk 'BEGIN{RS="\n---\n"} /(^|\n)kind: Ingress(\n|$)/{print}' "$T/default.yaml" | grep -q 'admin-api'; then
  fail "admin-api appears in an Ingress with default values"
fi

# 2. SSO enabled: the -sso Ingress holds exactly the expected paths.
helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" -f "$C/ci/ci-sso-values.yaml" > "$T/on.yaml"
sso_doc=$(awk 'BEGIN{RS="\n---\n"} /kind: Ingress/ && /name: os-opensteward-sso/{print}' "$T/on.yaml")
[ -n "$sso_doc" ] || fail "no -sso Ingress rendered"
got=$(printf '%s\n' "$sso_doc" | grep -E '^[[:space:]]+- path: ' | sed -E 's/^[[:space:]]+- path: //' | sort)
want=$(printf '%s\n' /api/sso/entra/acs /api/sso/entra/callback /api/sso/entra/login \
  /api/sso/okta/acs /api/sso/okta/callback /api/sso/okta/login /scim/v2/ | sort)
[ "$got" = "$want" ] || fail "unexpected SSO paths: $(echo $got)"
printf '%s\n' "$sso_doc" | grep -q 'pathType: Exact' || fail "SSO paths must be Exact"

# 3. Only the -sso Ingress may reference admin-api.
others=$(awk 'BEGIN{RS="\n---\n"} /kind: Ingress/ && !/name: os-opensteward-sso/{print}' "$T/on.yaml")
if printf '%s\n' "$others" | grep -q 'admin-api'; then fail "admin-api in a non-SSO Ingress"; fi

# 4. The NetworkPolicy admits only the configured peers.
awk 'BEGIN{RS="\n---\n"} /name: os-opensteward-allow-sso-ingress/{print}' "$T/on.yaml" \
  | grep -q 'kubernetes.io/metadata.name: ingress-nginx' || fail "allow-sso-ingress lacks allowFrom"

# 5. Misconfiguration fails the render.
for bad in "ingress.sso.host=" "ingress.sso.allowFrom=null" "publicUrls.adminApi="; do
  if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" -f "$C/ci/ci-sso-values.yaml" --set "$bad" >/dev/null 2>&1; then
    fail "render succeeded with --set $bad"
  fi
done
if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" -f "$C/ci/ci-sso-values.yaml" \
     --set 'ingress.sso.slugs=null' --set ingress.sso.scim=false >/dev/null 2>&1; then
  fail "render succeeded with no slugs and no scim"
fi

# 5b. ingress.sso.enabled without ingress.enabled must fail, not render nothing.
if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" -f "$C/ci/ci-sso-values.yaml" \
     --set ingress.enabled=false >/dev/null 2>&1; then
  fail "render succeeded with ingress.sso.enabled but ingress.enabled=false"
fi

# 6. Schema-valid.
if command -v kubeconform >/dev/null; then
  kubeconform -strict -ignore-missing-schemas -summary -kubernetes-version 1.29.0 "$T/on.yaml"
fi
echo "OK: SSO ingress invariants hold"
