#!/usr/bin/env bash
# Invariants for the license mount. Run locally and in CI (helm.yml).
# Pattern: ci/check-sso.sh. Assertions run on the extracted integration-server
# Deployment and, inside it, on the extracted license volume and mount blocks,
# so an unrelated `optional: true` or `readOnly: true` elsewhere in the chart
# (docs-server's SERVICE_SECRET ref, _helpers.tpl:136) cannot mask a regression.
set -euo pipefail
C="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail() { echo "FAIL: $*"; exit 1; }

# The Deployment document for one service. An exact name match, so "admin"
# never matches "admin-api".
deploy_of() { awk -v s="$2" 'BEGIN{RS="\n---\n"; n="\n  name: os-opensteward-" s "\n"} /kind: Deployment/ && index($0, n) {print}' "$1"; }
# The YAML list item "- name: license" at exactly <indent> spaces, through its
# last line (the next line indented <= <indent> ends it). Volumes sit at 8
# spaces and volumeMounts at 12 in templates/deployment.yaml.
item_at() {
  awk -v ind="$1" '
    function lead(s) { match(s, /^ */); return RLENGTH }
    !on && $0 == sprintf("%" ind "s- name: license", "") { on = 1; print; next }
    on && lead($0) <= ind { exit }
    on { print }'
}

for mode in sqlite postgres; do
  helm template os "$C" -f "$C/ci/ci-$mode-values.yaml" > "$T/off.yaml"
  if grep -qE 'OPENSTEWARD_LICENSE|/etc/opensteward/license|- name: license$' "$T/off.yaml"; then
    fail "$mode: license wiring rendered without license.existingSecret"
  fi

  helm template os "$C" -f "$C/ci/ci-$mode-values.yaml" --set license.existingSecret=os-license > "$T/on.yaml"
  [ "$(grep -c 'name: OPENSTEWARD_LICENSE_FILE' "$T/on.yaml")" -eq 1 ] || fail "$mode: OPENSTEWARD_LICENSE_FILE must render exactly once"
  [ "$(grep -c 'secretName: "os-license"' "$T/on.yaml")" -eq 1 ] || fail "$mode: the license Secret must be mounted exactly once (and quoted)"
  is="$(deploy_of "$T/on.yaml" integration-server)"
  [ -n "$is" ] || fail "$mode: no integration-server Deployment"
  # Herestrings throughout, never `… | grep -q`: under pipefail, grep -q exiting
  # on its first match can SIGPIPE the writer and turn a match into a failure.
  grep -qF 'value: "/etc/opensteward/license/license.key"' <<<"$is" \
    || fail "$mode: OPENSTEWARD_LICENSE_FILE does not point into the mount"

  mount="$(item_at 12 <<<"$is")"
  vol="$(item_at 8 <<<"$is")"
  [ -n "$mount" ] || fail "$mode: integration-server has no license volumeMount"
  [ -n "$vol" ] || fail "$mode: integration-server has no license volume"
  grep -qxE ' +mountPath: /etc/opensteward/license' <<<"$mount" || fail "$mode: mount the DIRECTORY /etc/opensteward/license"
  grep -qxE ' +readOnly: true' <<<"$mount" || fail "$mode: the license mount must be read-only"
  grep -qxE ' +secretName: "os-license"' <<<"$vol" || fail "$mode: the license volume must name the Secret"
  grep -qxE ' +optional: true' <<<"$vol" || fail "$mode: the license volume must be optional (a missing Secret must not block the pod)"
  grep -qxE ' +defaultMode: 288' <<<"$vol" || fail "$mode: defaultMode must be 288 (0440, readable by fsGroup 1000)"
  grep -qxE ' +- key: "license.key"' <<<"$vol" || fail "$mode: license.secretKey must default to license.key"
  grep -qxE ' +path: license.key' <<<"$vol" || fail "$mode: the Secret key must land as license.key"
  if grep -q 'subPath' "$T/on.yaml"; then fail "$mode: no subPath anywhere — a subPath mount never receives Secret updates"; fi

  for svc in admin admin-api docs-server webhook-gateway; do
    d="$(deploy_of "$T/on.yaml" "$svc")"
    [ -n "$d" ] || fail "$mode: no $svc Deployment"
    if grep -qE 'OPENSTEWARD_LICENSE|/etc/opensteward/license|- name: license$' <<<"$d"; then
      fail "$mode: $svc must not receive the license (single license authority)"
    fi
  done
  if command -v kubeconform >/dev/null; then
    kubeconform -strict -ignore-missing-schemas -summary -kubernetes-version 1.29.0 "$T/on.yaml"
  fi
done

helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret=os-license \
  --set license.secretKey=token > "$T/key.yaml"
key_is="$(deploy_of "$T/key.yaml" integration-server)"
key_vol="$(item_at 8 <<<"$key_is")"
grep -qxE ' +- key: "token"' <<<"$key_vol" || fail "license.secretKey is not used"
if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret=os-license \
     --set license.secretKey= >/dev/null 2>&1; then
  fail "render succeeded with an empty license.secretKey"
fi

# The license token pasted where the Secret NAME goes (the GCP form calls the
# field "License secret"). Rendered, it became `secretName: "v4.public…"`, and
# Kubernetes' refusal of that Deployment quotes the whole value into the
# deployer or CI log. The schema refuses it first, by length: helm's pattern
# error quotes the value too, so the name's pattern is checked only at a
# length a Secret name may have (253), which a token never does.
tok="v4.public.$(printf 'eyJBdWQiOiJvcGVuc3Rld2FyZCJ9_%.0s' {1..24})"
if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret="$tok" \
     >"$T/tok.yaml" 2>"$T/tok.err"; then
  fail "a license token was accepted as license.existingSecret"
fi
grep -q 'existingSecret' "$T/tok.err" || fail "the refusal of a token as license.existingSecret does not name the field"
if grep -qF "${tok:10:40}" "$T/tok.yaml" "$T/tok.err"; then
  fail "the refusal of a token as license.existingSecret prints the token"
fi
for bad in Os-License os_license -os-license os-license. 'os license'; do
  if helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret="$bad" >/dev/null 2>&1; then
    fail "'$bad' was accepted as a Secret name"
  fi
done
helm template os "$C" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret=os.license-1 >/dev/null \
  || fail "a valid Secret name (an RFC 1123 subdomain, dots included) was refused"
# helm 3.16 (what CI pins) never quotes a value in a pattern error, so the
# render above cannot see a pattern moved out from under `if`; helm 3.18 and
# later do quote it. Check the shape too.
jq -e '.properties.license.properties.existingSecret
  | .pattern == null and .maxLength == 253 and .if == {maxLength: 253} and (.then.pattern | type) == "string"' \
  "$C/values.schema.json" >/dev/null \
  || fail "license.existingSecret must check its pattern only under if: {maxLength: 253}: newer helm quotes the value in a pattern error"

# `helm upgrade --reuse-values` from a release installed before license.*
# existed renders this chart's templates with that release's chart defaults,
# which have no `license` key. Simulate it: this chart, minus the license block
# in values.yaml. A plain upgrade must still render (and lint, which renders
# NOTES.txt too), and the documented `--reuse-values --set
# license.existingSecret=…` must mount the key license.key.
cp -R "$C" "$T/old"
awk '/^license:/ { skip = 1; next } skip && /^[^ ]/ { skip = 0 } !skip' "$C/values.yaml" > "$T/old/values.yaml"
if grep -q '^license:' "$T/old/values.yaml"; then fail "could not strip the license block from values.yaml"; fi
helm template os "$T/old" -f "$C/ci/ci-sqlite-values.yaml" > "$T/reuse-off.yaml" \
  || fail "a --reuse-values upgrade from a pre-license release no longer renders"
if grep -qE 'OPENSTEWARD_LICENSE|/etc/opensteward/license|- name: license$' "$T/reuse-off.yaml"; then
  fail "license wiring rendered from pre-license values"
fi
helm lint "$T/old" -f "$C/ci/ci-sqlite-values.yaml" >/dev/null \
  || fail "the chart (NOTES.txt included) no longer lints with pre-license values"
helm template os "$T/old" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret=os-license > "$T/reuse-on.yaml" \
  || fail "--reuse-values --set license.existingSecret does not render on a pre-license release"
reuse_vol="$(item_at 8 <<<"$(deploy_of "$T/reuse-on.yaml" integration-server)")"
grep -qxE ' +- key: "license.key"' <<<"$reuse_vol" || fail "an absent license.secretKey must default to license.key"
helm lint "$T/old" -f "$C/ci/ci-sqlite-values.yaml" --set license.existingSecret=os-license >/dev/null \
  || fail "the chart (NOTES.txt included) does not lint with pre-license values and a license Secret"
echo "OK: license mount invariants hold"
