#!/usr/bin/env bash
# Compose stack smoke test — builds the five published services, starts the
# stack, and proves it actually works.
#
# WHY THIS EXISTS. Nothing in CI ever started the stack. docker-compose.yml
# healthchecks shell out to `wget`, and four `condition: service_healthy`
# gates hang off them. Any change that drops wget from the runtime image
# (distroless, node:*-slim, anything non-Alpine) leaves CI green and leaves
# every operator with a stack that will not start on their next pull.
#
# WHAT MAKES IT WORTH HAVING. "Everything came up healthy" is a weak
# assertion: it passes identically against a healthcheck that always returns
# success — and node-based healthcheck one-liners that fail open are a real,
# observed form. So this script does three things, in increasing order of
# value:
#
#   1. `up -d --wait`            — the stack starts and every gate passes.
#   2. host probes               — each published port really serves /health
#                                  from OUTSIDE the container, not just to
#                                  the healthcheck running inside it.
#   3. healthcheck mutation test — for each service, re-run THE SERVICE'S OWN
#                                  healthcheck command (read back from
#                                  `docker inspect`, never hardcoded) twice:
#                                  unchanged, which must exit 0, and pointed
#                                  at a port nothing listens on, which must
#                                  exit non-zero. A healthcheck that cannot
#                                  fail is a healthcheck that cannot report.
#   4. licence                   — inside every image: the in-image licence
#                                  probe and a production build-profile
#                                  label; then integration-server with no
#                                  licence (MISSING) and with a dev-kid token
#                                  (INVALID, healthy, the token never echoed
#                                  or logged).
#
# Step 3 is the one that catches a fail-open rewrite. Step 1 and 2 are
# scaffolding for it.
#
# The healthcheck is read as `.Config.Healthcheck.Test`, a JSON array whose
# first element is the directive. Both real forms are handled, and they need
# different handling when re-running the command yourself:
#
#   ["CMD", "wget", "-qO-", "http://..."]   -> exec the argv directly
#   ["CMD-SHELL", "wget -qO- http://..."]   -> one string, run under /bin/sh -c
#   ["NONE"] / absent                       -> hard failure: a service with no
#                                              healthcheck makes every
#                                              `service_healthy` gate on it a
#                                              no-op.
#   anything else                           -> hard failure, never guessed at.
#
# Usage:
#   scripts/compose-smoke.sh
#
# Runs against an ISOLATED compose project (default `opensteward-smoke`) so the
# mandatory `down -v` teardown can never delete a developer's own stack
# volumes. It does still bind the same host ports, so stop your own stack
# first: `docker compose down`.
#
# Environment knobs (CI sets none of them; defaults are the CI behaviour):
#   SMOKE_PROJECT             compose project name        (opensteward-smoke)
#   SMOKE_WAIT_TIMEOUT        seconds for `up --wait`     (300)
#   SMOKE_DEAD_PORT           port nothing listens on     (9)
#   SMOKE_BUILD_ARGS          extra args to `compose build` (e.g. --no-cache)
#   SMOKE_EXTRA_COMPOSE_FILE  overlay merged on top of docker-compose.yml.
#                             Exists so the mutation test can itself be
#                             tested, by overlaying a deliberately fail-open
#                             healthcheck and confirming this script goes red.

set -euo pipefail

PROJECT="${SMOKE_PROJECT:-opensteward-smoke}"
WAIT_TIMEOUT="${SMOKE_WAIT_TIMEOUT:-300}"
DEAD_PORT="${SMOKE_DEAD_PORT:-9}"

# The five services published by .github/workflows/images.yml. Listed rather
# than discovered so that a service silently disappearing from the default
# stack is a failure, not a smaller test.
EXPECTED_SERVICES="admin admin-api docs-server integration-server webhook-gateway"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ambient compose settings must not change what is under test. In particular
# the default stack is profile-free: `sso-dev` and `scale` stay out.
export COMPOSE_PROFILES=""
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILE || true
# Nor may an ambient licence. In compose interpolation a shell variable beats
# --env-file, so an exported OPENSTEWARD_LICENSE(_FILE) would fail the
# no-licence check and override the dev-kid token appended in 4b.
unset OPENSTEWARD_LICENSE OPENSTEWARD_LICENSE_FILE || true

FAILURES=0
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
pass() { printf '    \033[32mPASS\033[0m %s\n' "$*"; }
fail() { printf '    \033[31mFAIL\033[0m %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
die() { printf '\n\033[31mfatal: %s\033[0m\n' "$*" >&2; exit 1; }

for tool in docker curl jq openssl; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required but was not found in PATH"
done
docker compose version >/dev/null 2>&1 || die "docker compose v2+ is required"

COMPOSE_FILES=(-f docker-compose.yml)
if [ -n "${SMOKE_EXTRA_COMPOSE_FILE:-}" ]; then
  COMPOSE_FILES+=(-f "${SMOKE_EXTRA_COMPOSE_FILE}")
  info "overlay: ${SMOKE_EXTRA_COMPOSE_FILE}"
fi

# ── Secrets ──────────────────────────────────────────────────────────────────
# Every other compose variable carries a ${VAR:-default}; only these six have
# no safe default. Minted fresh per run by the same script operators are told
# to use, so nothing is hardcoded here and nothing is reused between runs.
ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/opensteward-smoke-env.XXXXXX")"
chmod 600 "$ENV_FILE"
scripts/generate-secrets.sh >"$ENV_FILE"

# Actions can only auto-mask values it was given as repository secrets. These
# are minted here at runtime, so nothing would redact them if one ever reached
# a log — and the failure path below deliberately dumps `docker compose logs`.
# Register each one explicitly. `::add-mask::` is a no-op outside Actions, so
# this is gated rather than printed into a developer's terminal.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  while IFS= read -r kv; do
    case "$kv" in '' | '#'*) continue ;; esac
    case "$kv" in *=*) ;; *) continue ;; esac
    value="${kv#*=}"
    # An `if` rather than `[ -n "$value" ] && echo ...`. Both are safe: bash
    # exempts a non-final command in an `&&` list from `errexit`, so the
    # short form does NOT kill the script on an empty value (verified on bash
    # 3.2.57 and 5.2.21, inside a `while` body). The `if` is used because it
    # says so without the reader having to know that rule.
    if [ -n "$value" ]; then echo "::add-mask::$value"; fi
  done <"$ENV_FILE"
fi

dc() { docker compose --project-name "$PROJECT" "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" "$@"; }

diagnostics() {
  printf '\n\033[1m==> DIAGNOSTICS (stack state at failure)\033[0m\n'
  dc ps --all || true
  for svc in $EXPECTED_SERVICES; do
    printf '\n--- logs: %s ---\n' "$svc"
    dc logs --no-color --tail=200 "$svc" 2>&1 || true
  done
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then diagnostics; fi
  step "Teardown"
  dc down -v --remove-orphans --timeout 30 || true
  rm -f "$ENV_FILE"
  exit "$status"
}
trap cleanup EXIT

# ── 0. The stack under test is the default stack ─────────────────────────────
step "Stack composition"
expected="$(printf '%s\n' $EXPECTED_SERVICES | sort | tr '\n' ' ')"

# EXPECTED_SERVICES duplicates the list in images.yml, so assert against that
# list rather than trusting the copy. Without this, a service added to or
# dropped from the published set drifts silently: docker-compose.yml drift is
# caught by the next check, images.yml drift by nothing at all.
published_json="$(sed -n "s/^[[:space:]]*ALL='\(\[.*\]\)'[[:space:]]*$/\1/p" .github/workflows/images.yml)"
if [ -z "$published_json" ]; then
  die "could not read the published-service list (ALL=...) from .github/workflows/images.yml — if that workflow changed shape, teach this script the new one"
fi
published="$(printf '%s' "$published_json" | jq -r '.[]' | sort | tr '\n' ' ')"
if [ "$published" = "$expected" ]; then
  pass "service list matches the five images published by images.yml"
else
  fail "images.yml publishes [$published], this script tests [$expected]"
  die "refusing to smoke-test a set of services that is not the published set"
fi

declared="$(dc config --services | sort | tr '\n' ' ')"
if [ "$declared" = "$expected" ]; then
  pass "default stack is exactly the five published services"
else
  fail "default stack is [$declared], expected [$expected]"
  die "refusing to smoke-test a stack that is not the one CI publishes"
fi

# ── 1. Build ─────────────────────────────────────────────────────────────────
step "Build"
build_start=$SECONDS
# shellcheck disable=SC2086
dc build ${SMOKE_BUILD_ARGS:-}
info "build took $((SECONDS - build_start))s"

# ── 2. Up, gated on every healthcheck ────────────────────────────────────────
# `--wait` blocks until every service is healthy and exits non-zero otherwise,
# which is the whole `condition: service_healthy` chain asserted in one flag.
# Bounded: the chain is integration-server -> {admin-api, docs-server,
# webhook-gateway} -> admin, and with interval 30s / retries 3 a first-attempt
# pass is ~90s. 300 leaves room for one retry per link without ever hanging
# the job.
step "Up (--wait, timeout ${WAIT_TIMEOUT}s)"
up_start=$SECONDS
up_log="$(mktemp)"
if ! dc up -d --wait --wait-timeout "$WAIT_TIMEOUT" 2>&1 | tee "$up_log"; then
  # Compose 5 ends `--wait` with "container … has no healthcheck configured"
  # once everything else is healthy, where older releases counted such a
  # service as running. A missing healthcheck is a finding, and section 3
  # fails it by name, so record it and carry on so every other assertion
  # still runs (the fail-open meta-test depends on that). Any other `up`
  # failure (unhealthy, exited, a dependency that failed) still stops here.
  if grep -q 'has no healthcheck configured' "$up_log" &&
    ! grep -qiE 'unhealthy|exited|dependency failed|error response|timeout' "$up_log"; then
    fail "up --wait: $(grep -o '[^ ]* has no healthcheck configured' "$up_log" | tr '\n' ';')"
  else
    rm -f "$up_log"
    exit 1
  fi
fi
rm -f "$up_log"
info "up took $((SECONDS - up_start))s"

running="$(dc ps --services --status running | sort | tr '\n' ' ')"
if [ "$running" = "$expected" ]; then
  pass "all five services running"
else
  fail "running services are [$running], expected [$expected]"
fi

# ── 3. Per-service assertions ────────────────────────────────────────────────
for svc in $EXPECTED_SERVICES; do
  step "Service: $svc"

  cid="$(dc ps -q "$svc")"
  [ -n "$cid" ] || { fail "$svc: no container"; continue; }

  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid")"
  if [ "$health" = "healthy" ]; then
    pass "$svc: container health = healthy"
  else
    fail "$svc: container health = $health"
  fi

  # Published port, read back from the running container rather than a table
  # in this script, so a compose port change is followed rather than missed.
  ports_json="$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$cid")"
  bound="$(printf '%s' "$ports_json" | jq -c '[to_entries[] | select(.value != null and (.value | length) > 0)]')"
  if [ "$(printf '%s' "$bound" | jq 'length')" -eq 0 ]; then
    fail "$svc: no published port; cannot probe from the host"
    continue
  fi
  container_port="$(printf '%s' "$bound" | jq -r '.[0].key | split("/")[0]')"
  host_port="$(printf '%s' "$bound" | jq -r '.[0].value[0].HostPort')"

  # ── 3a. Probe from the HOST ────────────────────────────────────────────────
  # The healthcheck runs inside the container. A service that answers there but
  # not on its published port is broken for every real user and green in CI.
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${host_port}/health" || true)"
  if [ "$code" = "200" ]; then
    pass "$svc: host probe http://127.0.0.1:${host_port}/health -> 200"
  else
    fail "$svc: host probe http://127.0.0.1:${host_port}/health -> ${code:-no response} (want 200)"
  fi

  # ── 3b. Healthcheck mutation test ──────────────────────────────────────────
  hc_json="$(docker inspect --format '{{if .Config.Healthcheck}}{{json .Config.Healthcheck.Test}}{{else}}null{{end}}' "$cid")"
  info "$svc: healthcheck test = $hc_json"

  # Read the array element by element, NOT by splitting jq -r's output on
  # newlines: a healthcheck argument containing a newline (which a YAML block
  # scalar produces) would split into extra elements and reconstruct a
  # different command.
  #
  # NUL-delimiting is the other correct answer and it genuinely works: jq emits
  # real NUL bytes for a "\u0000" escape, and `jq --raw-output0` does the same
  # (verified on jq 1.7.1 and jq 1.7). Its trap is one level away from jq —
  # NUL-delimited output cannot survive `$(...)`, because command substitution
  # silently drops NUL bytes (bash 5.2 warns, bash 3.2 does not), so it only
  # holds up while the bytes are piped straight into `read -r -d ''`.
  #
  # Indexing is used here instead because it never puts a separator inside the
  # captured text at all — there is nothing for `$()` to drop — and it carries
  # no jq version floor. The one thing `$()` does still eat is a trailing
  # newline, which is what the X sentinel below preserves.
  hc=()
  hc_len="$(printf '%s' "$hc_json" | jq 'if type == "array" then length else 0 end')"
  hc_i=0
  while [ "$hc_i" -lt "$hc_len" ]; do
    hc_elem="$(printf '%s' "$hc_json" | jq -r --argjson i "$hc_i" '.[$i]'; printf 'X')"
    hc_elem="${hc_elem%X}"
    hc_elem="${hc_elem%$'\n'}"
    hc+=("$hc_elem")
    hc_i=$((hc_i + 1))
  done

  if [ "${#hc[@]}" -eq 0 ] || [ "${hc[0]}" = "NONE" ]; then
    fail "$svc: no healthcheck — every 'condition: service_healthy' gate on this service is a no-op"
    continue
  fi

  # Build the same command twice: verbatim, and with the service's own port
  # swapped for one nothing is listening on.
  positive=()
  negative=()
  mutated=0
  case "${hc[0]}" in
    CMD)
      # argv form: docker execs these directly, so we do too.
      if [ "${#hc[@]}" -lt 2 ]; then
        fail "$svc: healthcheck is [\"CMD\"] with no command"
        continue
      fi
      for arg in "${hc[@]:1}"; do
        positive+=("$arg")
        swapped="${arg//:${container_port}/:${DEAD_PORT}}"
        if [ "$swapped" != "$arg" ]; then mutated=1; fi
        negative+=("$swapped")
      done
      ;;
    CMD-SHELL)
      # single string, run by docker under the container's default shell —
      # NOT execed as argv, which is the difference that matters when you
      # re-run it yourself.
      if [ "${#hc[@]}" -lt 2 ]; then
        fail "$svc: healthcheck is [\"CMD-SHELL\"] with no command"
        continue
      fi
      cmd="${hc[1]}"
      swapped="${cmd//:${container_port}/:${DEAD_PORT}}"
      if [ "$swapped" != "$cmd" ]; then mutated=1; fi
      positive=(/bin/sh -c "$cmd")
      negative=(/bin/sh -c "$swapped")
      ;;
    *)
      fail "$svc: unrecognised healthcheck directive '${hc[0]}' — expected CMD or CMD-SHELL"
      continue
      ;;
  esac

  if [ "$mutated" -ne 1 ]; then
    fail "$svc: could not derive a failing variant — the healthcheck never mentions :${container_port}, so this test cannot prove it is able to fail. Teach scripts/compose-smoke.sh the new form."
    continue
  fi

  set +e
  pos_out="$(docker exec "$cid" "${positive[@]}" 2>&1)"; pos_rc=$?
  neg_out="$(docker exec "$cid" "${negative[@]}" 2>&1)"; neg_rc=$?
  set -e

  # Positive control. Proves the command we re-derived is the real, runnable
  # healthcheck — without it, a negative control could "pass" for the boring
  # reason that the command is missing from the image entirely.
  if [ "$pos_rc" -eq 0 ]; then
    pass "$svc: healthcheck command exits 0 against the live service"
  else
    fail "$svc: healthcheck command exits $pos_rc against the LIVE service (want 0): ${pos_out}"
  fi

  # Negative control. THE assertion. Same command, port nothing is listening
  # on. A healthcheck that still exits 0 here reports success unconditionally
  # and would hide an outage rather than surface one.
  info "$svc: negative control -> ${negative[*]}"
  if [ "$neg_rc" -ne 0 ]; then
    pass "$svc: healthcheck exits $neg_rc against dead port :${DEAD_PORT} — it can fail"
  else
    fail "$svc: healthcheck exits 0 against dead port :${DEAD_PORT} — IT CANNOT FAIL. This healthcheck reports success unconditionally; every 'condition: service_healthy' gate on it is worthless. Output: ${neg_out}"
  fi
done

# ── 4. Licensing ─────────────────────────────────────────────────────────────
# Every $(...) below that runs docker, curl, jq or sed ends in `|| true`,
# following the 3a host-probe pattern: under `set -euo pipefail` such a
# failure would otherwise end the script before it prints a FAIL line. The
# fail-open meta-test runs this section too.
#
# 4a. Inside every image, without network (scripts/image-license-probe.cjs):
#     no dev key module; a keyring that trusts exactly the five production
#     kids, with and without dev keys requested; no dev keypair fixture or
#     private key baked in; a production build-profile label. Placeholder keys
#     are fine here: images.yml re-runs the probe with --release on every
#     pushed digest.
step "Licence probe in every image"
for svc in $EXPECTED_SERVICES; do
  cid="$(dc ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    fail "$svc: no container to read the image from"
    continue
  fi
  img="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true)"
  profile="$(docker image inspect --format '{{ index .Config.Labels "org.opensteward.build-profile" }}' "$img" 2>/dev/null || true)"
  if [ "$profile" = "production" ]; then
    pass "$svc: build profile label = production"
  else
    fail "$svc: build profile label = '${profile:-<none>}' (want production; a development image trusts the public dev1 key)"
  fi
  # No arguments after `-`: the probe refuses any it does not know, and
  # --release would fail on today's placeholder keys.
  if out="$(docker run --rm -i --network none --entrypoint node "$img" - <scripts/image-license-probe.cjs 2>&1)"; then
    pass "$svc: $out"
  else
    fail "$svc: ${out:-licence probe exited non-zero with no output}"
  fi
done

# 4b. integration-server, the single licence authority. With no licence it
#     reports MISSING and the stack is healthy. A token naming the dev kid must
#     be INVALID: a production image has no dev1 key at all, so UNKNOWN_KID.
#     BAD_SIGNATURE would mean the image still trusts dev1. The service stays
#     healthy, and the token is never echoed or logged.
step "Licence state (integration-server)"
admin_secret="$(sed -n 's/^ADMIN_SECRET=//p' "$ENV_FILE" | head -n 1 || true)"
# The published port, probed on 127.0.0.1 like 3a: `compose port` prints
# 0.0.0.0:<port> or [::]:<port>, and only the port is wanted.
is_addr="$(dc port integration-server 3010 2>/dev/null | head -n 1 || true)"
is_port="${is_addr##*:}"
license_json() { curl -s --max-time 10 -H "X-Admin-Secret: ${admin_secret}" "http://127.0.0.1:${is_port}/admin/license" || true; }
if [ -e opensteward-license/license.key ]; then
  info "skipping the no-licence check: ./opensteward-license/license.key exists on this host and is mounted"
else
  state="$(license_json | jq -r '.data.state // empty' 2>/dev/null || true)"
  if [ "$state" = "MISSING" ]; then
    pass "no licence → MISSING (community mode), stack healthy"
  else
    fail "no licence → state '${state:-<no response>}' (want MISSING)"
  fi
fi
b64url() { base64 | tr '+/' '-_' | tr -d '=\n'; }
# A well-formed v4.public token naming dev1, with an all-zero signature. The
# runner has no node and no fixture to mint a real dev1 signature, and a zero
# signature proves the same property: a production image does not know dev1.
dev_token="v4.public.$(head -c 96 /dev/zero | b64url).$(printf '{"kid":"dev1"}' | b64url)"
printf 'OPENSTEWARD_LICENSE=%s\n' "$dev_token" >>"$ENV_FILE"
if dc up -d --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" integration-server; then
  is_addr="$(dc port integration-server 3010 2>/dev/null | head -n 1 || true)"
  is_port="${is_addr##*:}"
  body="$(license_json)"
  sr="$(printf '%s' "$body" | jq -r '(.data.state // "") + "/" + (.data.reason // "")' 2>/dev/null || true)"
  case "$sr" in
    INVALID/UNKNOWN_KID | INVALID/DEV_KEY_ENV_MISMATCH) pass "dev-kid token → $sr; integration-server healthy" ;;
    INVALID/BAD_SIGNATURE) fail "dev-kid token → $sr: this image TRUSTS dev1 (a development-profile build?)" ;;
    *) fail "dev-kid token → '${sr:-<no response>}' (want INVALID/UNKNOWN_KID)" ;;
  esac
  src="$(printf '%s' "$body" | jq -r '.data.source // empty' 2>/dev/null || true)"
  if [ "$src" = "env" ]; then pass "status reports source=env"; else fail "status reports source='${src:-<none>}' (want env)"; fi
  # Herestrings, not `… | grep -q`: grep -q exits on its first match, the
  # writer takes SIGPIPE, and pipefail turns a match into a non-match (the
  # note on test.yml's compose-smoke scope step). An empty body or log
  # proves nothing, so neither counts as a pass.
  if grep -qF -- "$dev_token" <<<"$body"; then
    fail "/admin/license echoes the raw token"
  elif [ -n "$body" ]; then
    pass "/admin/license never returns the token"
  fi
  logs="$(dc logs --no-color integration-server 2>&1 || true)"
  if grep -qF -- "$dev_token" <<<"$logs"; then
    fail "integration-server logged the raw licence token"
  elif [ -n "$logs" ]; then
    pass "integration-server never logs the token"
  else
    fail "integration-server has no logs to search for the token"
  fi
else
  fail "integration-server did not come back healthy with a dev-kid licence; a licence problem must never stop the service"
fi

step "Result"
if [ "$FAILURES" -ne 0 ]; then
  printf '    \033[31m%d assertion(s) failed\033[0m\n' "$FAILURES"
  exit 1
fi
printf '    \033[32mall assertions passed\033[0m\n'
