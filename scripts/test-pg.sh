#!/usr/bin/env bash
# pnpm test:pg — every Postgres-backed test suite, against a throwaway
# postgres:16-alpine container.
#
# Every store in this repo runs on SQLite (the default) or Postgres
# (DATABASE_URL set). `pnpm test` only exercises SQLite; the Postgres leg of
# the dual-backend suites runs only when TEST_DATABASE_URL is set, and CI's
# `test-postgres` job is the only place that sets it. This script is that job,
# runnable on a laptop, and CI calls this script so the two cannot drift.
#
# Usage:
#   pnpm test:pg                               every suite
#   pnpm test:pg admin-api shared              only these suites
#   pnpm test:pg admin-api -- admin-store      extra args after `--` go to vitest
#   TEST_PG_KEEP=1 pnpm test:pg                leave the container running
#
# Suites (positional arguments; default: all of them):
#   shared               @opensteward/shared
#   destinations         @opensteward/destinations
#   admin-api
#   webhook-gateway
#   integration-server   only the files that read TEST_DATABASE_URL (found by
#                        grep, so a new one is picked up automatically), never
#                        the ~100k-test adapter suite
#
# The first four run through `turbo run test --concurrency=1`, as CI does:
# the suites reset Postgres per file (`DROP SCHEMA public CASCADE` or targeted
# drops) on ONE shared database, so two workspaces must never run at once.
#
# Environment:
#   TEST_PG_KEEP=1    do not remove the container on exit; prints how to reach it
#   TEST_PG_IMAGE     image to run (default postgres:16-alpine, the image CI uses)
#   TEST_PG_URL       use this existing Postgres instead of starting a container.
#                     CI sets it to its service container. It must be a
#                     superuser URL: the SQL-access suite creates databases and
#                     roles. Everything in its public schema is DROPPED, so it
#                     refuses a database named `opensteward` or one whose
#                     public._schema_migrations has rows (scripts/test-pg-guard.mts)
#   TEST_PG_FORCE=1   skip that check
#   TEST_PG_READY_TIMEOUT  seconds to wait for the container (default 60)
#   TEST_PG_DRY_RUN=1 print the test commands instead of running them (the
#                     container is still started and removed; used by
#                     scripts/test-pg.test.ts)
#
# The container gets a unique name, binds 127.0.0.1 on a free port chosen by
# Docker, keeps its data on a tmpfs (no volume is ever created), runs with
# --rm, and is removed with `docker rm -f -v` on every exit path (success,
# failure, Ctrl-C) unless TEST_PG_KEEP=1. No other container or volume is
# touched.
#
# Portable bash: macOS ships bash 3.2, so no associative arrays and no
# `${arr[@]}` under `set -u`.
set -euo pipefail

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${TEST_PG_IMAGE:-postgres:16-alpine}"
KEEP="${TEST_PG_KEEP:-0}"
DRY_RUN="${TEST_PG_DRY_RUN:-0}"
READY_TIMEOUT="${TEST_PG_READY_TIMEOUT:-60}"
ALL_SUITES="@opensteward/shared @opensteward/destinations admin-api webhook-gateway integration-server"

suites=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    shared | @opensteward/shared) suites="$suites @opensteward/shared" ;;
    destinations | @opensteward/destinations) suites="$suites @opensteward/destinations" ;;
    admin-api | webhook-gateway | integration-server) suites="$suites $1" ;;
    *)
      echo "test:pg: unknown suite '$1' (expected: shared destinations admin-api webhook-gateway integration-server)" >&2
      exit 2
      ;;
  esac
  shift
done
[ -n "$suites" ] || suites="$ALL_SUITES"
# Whatever is left in "$@" is passed to vitest.

turbo_filters=""
run_integration_server=0
for s in $suites; do
  if [ "$s" = "integration-server" ]; then
    run_integration_server=1
  else
    turbo_filters="$turbo_filters --filter=$s"
  fi
done

container=""
cleanup() {
  status=$?
  if [ -n "$container" ]; then
    if [ "$KEEP" = "1" ]; then
      echo
      echo "test:pg: TEST_PG_KEEP=1 — container '$container' left running."
      echo "  export TEST_DATABASE_URL=${TEST_DATABASE_URL:-}"
      echo "  remove it with: docker rm -f -v $container"
    else
      # -v as well: a volume the image declares would otherwise outlive it
      # (the data dir is a tmpfs, so there should be none — belt and braces).
      docker rm -f -v "$container" >/dev/null 2>&1 || true
      echo "test:pg: removed container $container"
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
# A signal must still run the EXIT trap (and exit non-zero).
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -n "${TEST_PG_URL:-}" ]; then
  echo "test:pg: using the existing Postgres in TEST_PG_URL (no container)"
  # The suites drop its public schema: refuse a database that looks real.
  node scripts/test-pg-guard.mts "$TEST_PG_URL"
  TEST_DATABASE_URL="$TEST_PG_URL"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "test:pg: docker is not on PATH — install Docker, or set TEST_PG_URL to an existing Postgres" >&2
    exit 1
  fi
  container="opensteward-test-pg-$(date +%s)-$$"
  echo "test:pg: starting $IMAGE as $container"
  # `-p 127.0.0.1::5432` lets Docker pick a free host port atomically; read it
  # back below instead of guessing one and racing for it.
  # --tmpfs over the data directory: the image declares it a VOLUME, and a
  # bind or tmpfs mount there is what keeps Docker from creating an anonymous
  # volume per run. Faster too.
  docker run -d --rm --name "$container" \
    -e POSTGRES_PASSWORD=test -e POSTGRES_DB=osdb \
    -p 127.0.0.1::5432 \
    --tmpfs /var/lib/postgresql/data \
    "$IMAGE" >/dev/null
  # First line, last `:`-field ("127.0.0.1:54321"); no `| head` under pipefail.
  published="$(docker port "$container" 5432/tcp)"
  published="${published%%"
"*}"
  port="${published##*:}"
  if [ -z "$port" ]; then
    echo "test:pg: could not read the published port of $container" >&2
    exit 1
  fi
  # -h 127.0.0.1 probes TCP: the image's init phase runs a temporary server on
  # the unix socket only, which a socket probe would report as ready too early.
  printf 'test:pg: waiting for Postgres on 127.0.0.1:%s ' "$port"
  ready=0
  i=0
  while [ "$i" -lt "$READY_TIMEOUT" ]; do
    if docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres -d osdb >/dev/null 2>&1; then
      ready=1
      break
    fi
    printf '.'
    sleep 1
    i=$((i + 1))
  done
  echo
  if [ "$ready" != "1" ]; then
    echo "test:pg: Postgres did not become ready within ${READY_TIMEOUT}s; last log lines:" >&2
    docker logs --tail 20 "$container" >&2 || true
    exit 1
  fi
  TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:$port/osdb"
fi
export TEST_DATABASE_URL

failed=""

# `run` executes, or with TEST_PG_DRY_RUN=1 only prints, a test command.
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "test:pg (dry run): $*"
    return 0
  fi
  "$@"
}

if [ -n "$turbo_filters" ]; then
  echo "test:pg: turbo run test$turbo_filters --concurrency=1"
  # shellcheck disable=SC2086 # the filters are single words, split on purpose
  if ! run pnpm exec turbo run test $turbo_filters --concurrency=1 -- "$@"; then
    failed="$failed turbo($suites)"
  fi
fi

if [ "$run_integration_server" = "1" ]; then
  # Only the integration-server files that honour TEST_DATABASE_URL. Found by
  # grep so a new Postgres-backed file joins without editing this script.
  is_files="$(grep -rl --include='*.test.ts' 'TEST_DATABASE_URL' apps/integration-server/tests | sort | sed 's|^apps/integration-server/||' | tr '\n' ' ')"
  if [ -z "$is_files" ]; then
    echo "test:pg: no integration-server test file reads TEST_DATABASE_URL" >&2
    failed="$failed integration-server(no-files)"
  else
    # Its tests import the BUILT workspace packages; turbo's test task would
    # build them, but this path calls vitest directly.
    run pnpm exec turbo run build --filter='integration-server^...' --output-logs=errors-only
    echo "test:pg: integration-server: $is_files"
    # shellcheck disable=SC2086 # file list is split on purpose (paths have no spaces)
    if ! run pnpm --filter integration-server exec vitest run --no-file-parallelism $is_files "$@"; then
      failed="$failed integration-server"
    fi
  fi
fi

if [ -n "$failed" ]; then
  echo "test:pg: FAILED:$failed" >&2
  exit 1
fi
echo "test:pg: all Postgres suites passed"
