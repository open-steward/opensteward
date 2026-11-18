#!/usr/bin/env bash
# switch-db.sh — move the local compose stack between SQLite and Postgres,
# optionally copying the data across.
#
# Usage:
#   scripts/switch-db.sh postgres [--copy] [options]   SQLite volumes -> Postgres
#   scripts/switch-db.sh sqlite   [--copy] [options]   Postgres -> SQLite volumes
#
# What it does, in order (docs/operations/switching-databases.md):
#   1. with --copy, BEFORE anything is stopped: starts `postgres` if it is not
#      running, checks each image has dist/db-copy.js, and runs `db-copy
#      --dry-run` for every service database that moves (admin-api's admin
#      database, integration-server's credentials and resources databases,
#      and webhook-gateway's if your overlay moves it too) — schema check and
#      row counts, nothing written. Any refusal ends the script here; a
#      database with nothing to copy (exit 5) does too, unless --skip-missing.
#      Then it asks you to confirm (--yes skips; without a terminal it
#      refuses up front). Cancelling leaves the stack exactly as it was;
#   2. stops every service of the stack (`stop` only: never `down`, never -v,
#      no volume is ever removed);
#   3. with --copy: dumps Postgres first when it is the target (pg_dump in the
#      postgres container, to an owner-only file), then runs `node
#      dist/db-copy.js --overwrite` for each database in a one-off container
#      of that service's image — its SQLite volume mounted, on the compose
#      network with Postgres. A SQLite target file is snapshotted next to
#      itself in its volume by db-copy;
#   4. starts the stack in the target mode with the right -f files and
#      profiles, and prints what it did. If anything fails after step 2, it
#      restarts the stack in the mode it was in.
#
# Options:
#   --copy              copy the data into the target (default: switch only;
#                       each backend keeps whatever it held before)
#   --yes               do not ask before overwriting the target's data
#   --keep-backups N    SQLite snapshots db-copy keeps per database file, newest
#                       first (db-copy's default: 3); older ones are pruned
#                       after a successful copy
#   --skip-missing      go on when a database has nothing to copy (e.g.
#                       DATA_STORE_MODE=passthrough has no resources database)
#   --profiles "a b"    compose profiles to start besides `analytics` (default:
#                       those whose containers exist now — sso-dev, https, scale)
#   --overlay FILE      the Postgres overlay (default
#                       docker-compose.analytics.example.yml)
#   --no-start          stop, copy, but do not start the stack afterwards
#   --dry-run           print every command instead of running it
#   -h, --help
#
# Files: docker-compose.yml, plus the overlay in postgres mode, plus
# docker-compose.override.yml when it exists (passing any -f turns off
# compose's automatic loading of it, so it is always passed explicitly).
#
# SQLite paths are read from the files docker-compose.yml mounts into the
# services — apps/admin-api/config/config.yml `db.path`,
# apps/integration-server/config/config.example.yml `storePath`,
# apps/webhook-gateway/config/config.yml `db.path` — and, inside the
# container, STORE_PATH / DATA_STORE_PATH as the service itself reads them.
#
# The images must contain dist/db-copy.js: rebuild admin-api and
# integration-server (and webhook-gateway) from a checkout that has it, one at
# a time on a small Docker VM. The script builds nothing (`up --no-build`).
#
# Environment: SWITCH_DB_BACKUP_DIR (default ~/.opensteward/db-backups) for
# the Postgres dump, created owner-only; COMPOSE_PROJECT_NAME is honoured.
# SWITCH_DB_ASSUME_TTY=1 treats stdin as a terminal (scripts/switch-db.test.ts).
#
# Portable bash (macOS ships 3.2): no associative arrays, no mapfile.
set -euo pipefail

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET=""
COPY=0
YES=0
DRY_RUN=0
START=1
SKIP_MISSING=0
KEEP_BACKUPS=""
PROFILES_SET=0
PROFILES=""
OVERLAY="docker-compose.analytics.example.yml"

while [ $# -gt 0 ]; do
  case "$1" in
    sqlite | postgres) TARGET="$1" ;;
    --copy) COPY=1 ;;
    --yes | -y) YES=1 ;;
    --skip-missing) SKIP_MISSING=1 ;;
    --keep-backups)
      [ $# -ge 2 ] || {
        echo "switch-db: --keep-backups needs a number" >&2
        exit 2
      }
      case "$2" in
        '' | *[!0-9]* | 0)
          echo "switch-db: --keep-backups needs a positive whole number (got '$2')" >&2
          exit 2
          ;;
      esac
      KEEP_BACKUPS="$2"
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    --no-start) START=0 ;;
    --profiles)
      [ $# -ge 2 ] || {
        echo "switch-db: --profiles needs a value" >&2
        exit 2
      }
      PROFILES="$2"
      PROFILES_SET=1
      shift
      ;;
    --overlay)
      [ $# -ge 2 ] || {
        echo "switch-db: --overlay needs a file" >&2
        exit 2
      }
      OVERLAY="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "switch-db: unknown argument '$1' (see --help)" >&2
      exit 2
      ;;
  esac
  shift
done

if [ -z "$TARGET" ]; then
  echo "switch-db: say which backend to switch to: sqlite or postgres (see --help)" >&2
  exit 2
fi
case "$OVERLAY" in
  *' '*)
    echo "switch-db: the overlay path must not contain spaces" >&2
    exit 2
    ;;
esac
if [ ! -f "$OVERLAY" ]; then
  echo "switch-db: overlay $OVERLAY not found" >&2
  exit 2
fi

# A confirmation needs a terminal; find out before touching anything.
if [ "$COPY" = "1" ] && [ "$YES" != "1" ] && [ "$DRY_RUN" != "1" ] &&
  [ ! -t 0 ] && [ "${SWITCH_DB_ASSUME_TTY:-}" != "1" ]; then
  echo "switch-db: --copy asks for confirmation and there is no terminal to ask on;" >&2
  echo "  re-run with --yes (nothing has been changed)." >&2
  exit 2
fi

PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')}"
BACKUP_DIR="${SWITCH_DB_BACKUP_DIR:-$HOME/.opensteward/db-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# ── Compose arguments ──────────────────────────────────────────────────────
# Paths and profile names contain no spaces, so these are plain strings split
# on purpose where they are used (bash, not zsh, splits unquoted expansions).
FILES_SQLITE="-f docker-compose.yml"
FILES_PG="-f docker-compose.yml -f $OVERLAY"
if [ -f docker-compose.override.yml ]; then
  FILES_SQLITE="$FILES_SQLITE -f docker-compose.override.yml"
  FILES_PG="$FILES_PG -f docker-compose.override.yml"
fi

services_of_project() { # $1 = extra docker ps flags ("" or "running")
  if [ "$1" = "running" ]; then
    docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter status=running \
      --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null || true
  else
    docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
      --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null || true
  fi
}

has_line() { # $1 = newline-separated list, $2 = exact line. A `case`, not
  # `printf | grep -q`: under pipefail an early-exiting grep can SIGPIPE the
  # producer and read as "not found".
  case "
$1
" in
    *"
$2
"*) return 0 ;;
  esac
  return 1
}

EXISTING="$(services_of_project all)"
RUNNING="$(services_of_project running)"

if [ "$PROFILES_SET" = "0" ]; then
  # A profile is "in use" when a container of one of its services exists
  # (running or stopped): the stack was brought up with it.
  for pair in "sso-dev:sso-dev-idp" "sso-dev:sso-dev-proxy" "https:caddy" "scale:redis"; do
    profile="${pair%%:*}"
    service="${pair#*:}"
    has_line "$EXISTING" "$service" || continue
    case " $PROFILES " in
      *" $profile "*) ;;
      *) PROFILES="${PROFILES:+$PROFILES }$profile" ;;
    esac
  done
fi

profile_flags() { # $1 = include analytics? (1/0)
  flags=""
  [ "$1" = "1" ] && flags="--profile analytics"
  for p in $PROFILES; do flags="$flags --profile $p"; done
  printf '%s' "$flags"
}
ARGS_SQLITE="$FILES_SQLITE $(profile_flags 0)"
ARGS_PG="$FILES_PG $(profile_flags 1)"

# The mode the stack is in now, from admin-api's environment. The template
# prints "set" when DATABASE_URL is non-empty — the value never leaves docker.
current_mode() {
  ids="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=admin-api" --format '{{.ID}}' 2>/dev/null || true)"
  c="${ids%%"
"*}"
  if [ -z "$c" ]; then
    echo "unknown"
    return
  fi
  set_="$(docker inspect --format '{{range .Config.Env}}{{$kv := split . "="}}{{if eq (index $kv 0) "DATABASE_URL"}}{{if gt (len (index $kv 1)) 0}}set{{end}}{{end}}{{end}}' "$c" 2>/dev/null || true)"
  if [ "$set_" = "set" ]; then echo "postgres"; else echo "sqlite"; fi
}

DONE=""
note() {
  DONE="$DONE
  - $*"
}

run() {
  # Print the command as it could be pasted: an argument with a space or a
  # quote in it is single-quoted.
  printf '+'
  for a in "$@"; do
    case "$a" in
      *' '* | *'"'*) printf " '%s'" "$a" ;;
      *) printf ' %s' "$a" ;;
    esac
  done
  echo
  if [ "$DRY_RUN" = "1" ]; then return 0; fi
  "$@"
}

# ── SQLite paths, as the services resolve them ─────────────────────────────
# `yaml_value FILE key` / `yaml_value FILE parent.key`: a top-level scalar or
# one level of nesting, comments and quotes stripped. Enough for these files.
yaml_value() {
  [ -f "$1" ] || return 0
  awk -v key="$2" '
    function clean(v) {
      sub(/[ \t]+#.*$/, "", v); gsub(/^[ \t]+|[ \t]+$/, "", v)
      gsub(/^["\047]|["\047]$/, "", v); return v
    }
    BEGIN { n = split(key, k, ".") }
    n == 1 && index($0, k[1] ":") == 1 { v = substr($0, length(k[1]) + 2); print clean(v); exit }
    n == 2 && index($0, k[1] ":") == 1 { inb = 1; next }
    n == 2 && inb && /^[^ \t#]/ { inb = 0 }
    n == 2 && inb && $0 ~ ("^[ \t]+" k[2] ":") { v = $0; sub("^[ \t]+" k[2] ":", "", v); print clean(v); exit }
  ' "$1"
}
safe_path() { # the value goes into a `sh -c` string: allow plain paths only
  case "$1" in
    *[!A-Za-z0-9_./-]*)
      echo "switch-db: refusing the unusual SQLite path '$1' from $2" >&2
      exit 2
      ;;
  esac
}
ADMIN_DB="$(yaml_value apps/admin-api/config/config.yml db.path)"
ADMIN_DB="${ADMIN_DB:-./data/admin.db}"
STORE_DB="$(yaml_value apps/integration-server/config/config.example.yml storePath)"
STORE_DB="${STORE_DB:-./data/credentials.db}"
WEBHOOK_DB="$(yaml_value apps/webhook-gateway/config/config.yml db.path)"
WEBHOOK_DB="${WEBHOOK_DB:-./data/webhook-gateway.db}"
safe_path "$ADMIN_DB" apps/admin-api/config/config.yml
safe_path "$STORE_DB" apps/integration-server/config/config.example.yml
safe_path "$WEBHOOK_DB" apps/webhook-gateway/config/config.yml
case "$STORE_DB" in
  */*) STORE_DIR="${STORE_DB%/*}" ;;
  *) STORE_DIR="." ;;
esac

# ── Which databases move ───────────────────────────────────────────────────
# A service's database moves when the Postgres-mode config gives THAT service
# a DATABASE_URL. The awk reads only the service's own block and prints
# nothing, so the resolved URL and its password never reach the terminal.
on_pg() {
  # shellcheck disable=SC2086 # compose args are split on purpose
  docker compose $ARGS_PG config 2>/dev/null | awk -v svc="$1" '
    /^services:/ { in_services = 1; next }
    in_services && /^[^ ]/ { in_services = 0 }
    in_services && /^  [^ ]/ { cur = $1; sub(/:$/, "", cur) }
    in_services && cur == svc && /DATABASE_URL: *postgres/ { found = 1 }
    END { exit found ? 0 : 1 }'
}

# service  db-name  sqlite path (relative paths resolve from the service's
# working directory in its container, as the service resolves them; ${…} is
# expanded inside the container)
DBS="admin-api admin $ADMIN_DB
integration-server credentials \${STORE_PATH:-$STORE_DB}
integration-server resources \${DATA_STORE_PATH:-$STORE_DIR/resources.db}
webhook-gateway webhook $WEBHOOK_DB"

MOVING=""
while read -r service db path; do
  [ -n "$service" ] || continue
  if on_pg "$service"; then
    MOVING="$MOVING$service $db $path
"
  fi
done <<EOF
$DBS
EOF

PREV="$(current_mode)"
WAS_RUNNING=0
[ -n "$RUNNING" ] && WAS_RUNNING=1
PG_WAS_RUNNING=0
has_line "$RUNNING" postgres && PG_WAS_RUNNING=1

echo "switch-db: → $TARGET$([ "$COPY" = "1" ] && echo ' (copying data)')$([ "$DRY_RUN" = "1" ] && echo ' [dry run: printing commands only]')"
echo "  project:   $PROJECT (currently: $PREV$([ "$WAS_RUNNING" = "1" ] && echo ', running' || echo ', not running'))"
echo "  files:     $([ "$TARGET" = postgres ] && echo "$FILES_PG" || echo "$FILES_SQLITE")"
if [ "$TARGET" = postgres ]; then
  echo "  profiles:  analytics${PROFILES:+ $PROFILES}"
else
  echo "  profiles:  ${PROFILES:-(none)}"
fi
if [ -n "$MOVING" ]; then
  echo "  databases that live on Postgres in postgres mode:"
  printf '%s' "$MOVING" | while read -r service db path; do echo "    $db ($service): sqlite $path"; done
else
  echo "  WARNING: the Postgres-mode config gives no service a DATABASE_URL — check $OVERLAY" >&2
fi

STOPPED=0
# Set once the first real copy starts: from then on the target may be partly
# overwritten.
COPYING=0
DUMP=""
STARTED_PG=0

# Undo what the preflight started (the stack itself is untouched then).
undo_preflight() {
  if [ "$STARTED_PG" = "1" ]; then
    # shellcheck disable=SC2086
    run docker compose $ARGS_PG stop postgres || true
    STARTED_PG=0
  fi
}

# After a failure past the stop: bring the stack back in the mode it was in.
# Its databases are what they were — a copy only ever writes to the target.
restore_previous() {
  if [ "$WAS_RUNNING" != "1" ]; then
    echo "  The stack was not running before; it is left stopped." >&2
    return 0
  fi
  case "$PREV" in
    postgres)
      # shellcheck disable=SC2086
      run docker compose $ARGS_PG up -d --no-build || true
      ;;
    sqlite)
      # shellcheck disable=SC2086
      run docker compose $ARGS_SQLITE up -d --no-build || true
      if [ "$PG_WAS_RUNNING" != "1" ]; then
        # shellcheck disable=SC2086
        run docker compose $ARGS_PG stop postgres || true
      fi
      ;;
    *)
      echo "  Could not tell which mode it was in; start it yourself." >&2
      return 0
      ;;
  esac
  echo "switch-db: restarted the stack in its previous mode ($PREV)." >&2
}

leave_stopped_after_refresh() {
  echo "switch-db: the stack is left stopped: it was already on $TARGET, and that copy was" >&2
  echo "  being overwritten when the copy failed, so starting it would serve half a copy." >&2
  if [ "$TARGET" = "postgres" ]; then
    echo "  Restore the dump taken just before the copy, then start the stack:" >&2
    echo "    docker compose $ARGS_PG exec -T postgres pg_restore -U opensteward --clean -d opensteward < $DUMP" >&2
    echo "    docker compose $ARGS_PG up -d --no-build" >&2
  else
    echo "  Each SQLite file db-copy overwrote has a snapshot next to it in its volume," >&2
    echo "  <file>.pre-copy-<time>.bak (the newest is from this run). Copy it back over the" >&2
    echo "  file, or re-run this switch; then start the stack:" >&2
    echo "    docker compose $ARGS_SQLITE up -d --no-build" >&2
  fi
}

on_exit() {
  status=$?
  if [ "$status" != "0" ] && [ "$DRY_RUN" != "1" ]; then
    echo >&2
    echo "switch-db: stopped with an error (exit $status). Nothing was removed." >&2
    if [ "$STOPPED" = "1" ] && [ "$COPYING" = "1" ] && [ "$PREV" = "$TARGET" ]; then
      # A same-mode refresh: the previous mode's database IS the target the
      # copy was writing, so restarting would serve a partly overwritten one.
      leave_stopped_after_refresh
    elif [ "$STOPPED" = "1" ]; then
      restore_previous
    else
      undo_preflight
      echo "  The stack was not stopped." >&2
    fi
  fi
}
trap on_exit EXIT

NEED_PG=0
[ "$TARGET" = "postgres" ] && NEED_PG=1
[ "$COPY" = "1" ] && NEED_PG=1

copy_cmd() { # $1 service, $2 db, $3 sqlite path, $4 extra flags
  if [ "$TARGET" = "postgres" ]; then
    from="sqlite:$3"
    to="env:DATABASE_URL"
  else
    from="env:DATABASE_URL"
    to="sqlite:$3"
  fi
  # One-off container of the service's own image, its volume mounted, on the
  # compose network. DATABASE_URL comes from the Postgres-mode service env and
  # is expanded by db-copy itself (env:), so it never appears in a command.
  # stdin is /dev/null: `run` attaches stdin, and inside a `while read` loop
  # it would swallow the rest of the list.
  # shellcheck disable=SC2086
  run docker compose $ARGS_PG run --rm --no-deps -T "$1" \
    sh -c "exec node dist/db-copy.js --db $2 --from \"$from\" --to \"$to\" $4" </dev/null
}

# Postgres dumped by this script, so db-copy is told a backup exists.
# Into SQLite, db-copy snapshots each file itself (and prunes to --keep-backups).
COPY_FLAGS="--overwrite"
[ "$TARGET" = "postgres" ] && COPY_FLAGS="--overwrite --no-backup"
[ "$TARGET" = "sqlite" ] && [ -n "$KEEP_BACKUPS" ] && COPY_FLAGS="$COPY_FLAGS --keep-backups $KEEP_BACKUPS"

# ── 1. Preflight: nothing is stopped until the copy is confirmed ───────────
TODO=""
SKIPPED=""
if [ "$COPY" = "1" ] && [ -n "$MOVING" ]; then
  echo
  echo "1. preflight: $([ "$TARGET" = postgres ] && echo 'SQLite → Postgres' || echo 'Postgres → SQLite') (the stack keeps running)"
  if [ "$PG_WAS_RUNNING" != "1" ]; then
    # shellcheck disable=SC2086
    run docker compose $ARGS_PG up -d --no-build --wait postgres
    STARTED_PG=1
  fi

  # Images must carry the tool; building is left to the operator.
  for service in $(printf '%s' "$MOVING" | awk '{print $1}' | sort -u); do
    echo "+ docker compose $ARGS_PG run --rm --no-deps -T $service node dist/db-copy.js --list"
    if [ "$DRY_RUN" != "1" ]; then
      # shellcheck disable=SC2086
      if ! docker compose $ARGS_PG run --rm --no-deps -T "$service" node dist/db-copy.js --list </dev/null >/dev/null 2>&1; then
        echo "switch-db: the $service image has no dist/db-copy.js (or could not start)." >&2
        echo "  Rebuild it from this checkout, one image at a time:" >&2
        echo "  docker compose $FILES_PG build $service" >&2
        exit 1
      fi
    fi
  done

  # Dry runs: schema versions and row counts, nothing written.
  while read -r service db path; do
    [ -n "$service" ] || continue
    echo
    echo "db-copy --dry-run: $db ($service)"
    set +e
    copy_cmd "$service" "$db" "$path" "--dry-run $COPY_FLAGS"
    code=$?
    set -e
    case "$code" in
      0) TODO="$TODO$service $db $path
" ;;
      5)
        if [ "$SKIP_MISSING" != "1" ]; then
          echo "switch-db: the source holds nothing to copy for $db (exit 5). If that is expected" >&2
          echo "  (DATA_STORE_MODE=passthrough has no resources database), re-run with --skip-missing." >&2
          exit 1
        fi
        echo "  nothing to copy for $db — skipped (--skip-missing)"
        SKIPPED="${SKIPPED:+$SKIPPED, }$db"
        ;;
      *)
        echo "switch-db: the dry run for $db was refused (exit $code); nothing has been changed." >&2
        exit 1
        ;;
    esac
  done <<EOF
$MOVING
EOF

  echo
  if [ -n "$TODO" ]; then
    echo "About to STOP the stack and REPLACE the $TARGET copy of:"
    printf '%s' "$TODO" | while read -r service db _; do echo "  - $db ($service)"; done
  else
    echo "About to STOP the stack; there is nothing to copy."
  fi
  [ -n "$SKIPPED" ] && echo "Skipped, nothing to copy: $SKIPPED (the target's copy is left as it is)."
  if [ "$TARGET" = "postgres" ]; then
    echo "Postgres is dumped to $BACKUP_DIR first."
  else
    echo "Each SQLite file is snapshotted next to itself (<file>.pre-copy-<time>.bak) first."
  fi
  if [ "$YES" != "1" ] && [ "$DRY_RUN" != "1" ]; then
    printf 'Type "yes" to continue: '
    answer=""
    read -r answer || true
    if [ "$answer" != "yes" ]; then
      undo_preflight
      echo "switch-db: cancelled; the stack was not touched."
      trap - EXIT
      exit 0
    fi
  fi
fi

# ── 2. Stop ────────────────────────────────────────────────────────────────
# Every service in either mode's files, analytics included, so nothing
# (Superset included) holds a connection to a database about to be rewritten.
echo
echo "2. stopping the stack (stop only — no down, no -v)"
# shellcheck disable=SC2086
run docker compose $ARGS_PG stop
STOPPED=1
STARTED_PG=0
note "stopped the stack (containers kept, volumes untouched)"

# ── 3. Copy ────────────────────────────────────────────────────────────────
if [ "$NEED_PG" = "1" ]; then
  # shellcheck disable=SC2086
  run docker compose $ARGS_PG up -d --no-build --wait postgres
  note "started postgres"
fi

if [ -n "$TODO" ]; then
  echo
  echo "3. copying"
  if [ "$TARGET" = "postgres" ]; then
    DUMP="$BACKUP_DIR/opensteward-postgres-$STAMP.dump"
    echo "+ docker compose $ARGS_PG exec -T postgres pg_dump -U opensteward -d opensteward -Fc > $DUMP"
    if [ "$DRY_RUN" != "1" ]; then
      # The dump holds encrypted credentials and PII: owner-only directory and
      # file from birth, and an existing directory is tightened.
      (umask 077 && mkdir -p "$BACKUP_DIR")
      chmod 700 "$BACKUP_DIR"
      # shellcheck disable=SC2086
      (umask 077 && docker compose $ARGS_PG exec -T postgres \
        pg_dump -U opensteward -d opensteward -Fc </dev/null >"$DUMP")
    fi
    note "dumped Postgres to $DUMP"
  fi

  COPYING=1

  while read -r service db path; do
    [ -n "$service" ] || continue
    echo
    echo "db-copy: $db ($service)"
    copy_cmd "$service" "$db" "$path" "$COPY_FLAGS"
    note "copied $db ($service) → $TARGET"
  done <<EOF
$TODO
EOF
elif [ "$COPY" = "1" ] && [ -z "$MOVING" ]; then
  echo "switch-db: --copy given but no database moves; nothing copied" >&2
fi
[ -n "$SKIPPED" ] && note "skipped (nothing to copy): $SKIPPED"

if [ "$TARGET" = "sqlite" ] && [ "$NEED_PG" = "1" ]; then
  # Started only to copy from; SQLite mode leaves it stopped (data kept).
  # shellcheck disable=SC2086
  run docker compose $ARGS_PG stop postgres
  note "stopped postgres again (its volume keeps the data)"
fi

# ── 4. Start ───────────────────────────────────────────────────────────────
if [ "$START" = "1" ]; then
  echo
  echo "4. starting the stack on $TARGET"
  if [ "$TARGET" = "postgres" ]; then
    # shellcheck disable=SC2086
    run docker compose $ARGS_PG up -d --no-build
  else
    # Without the analytics profile, postgres and Superset stay stopped (kept,
    # with their volume) and the services open their SQLite volumes again.
    # shellcheck disable=SC2086
    run docker compose $ARGS_SQLITE up -d --no-build
  fi
  note "started the stack on $TARGET"
fi

echo
echo "switch-db: done$([ "$DRY_RUN" = "1" ] && echo ' (dry run: nothing was executed)')$DONE"
if [ "$TARGET" = "postgres" ]; then
  echo "Admin UI: http://localhost:3000 (Superset dashboards are framed from http://localhost:8088)."
  [ "$COPY" = "1" ] || echo "Postgres keeps whatever it held before; the SQLite volumes are untouched."
  if [ -n "$TODO" ]; then
    echo "Restore the dump if you need to: docker compose $ARGS_PG exec -T postgres \\"
    echo "  pg_restore -U opensteward --clean -d opensteward < ${DUMP:-<dump file>}"
  fi
else
  [ "$COPY" = "1" ] || echo "The SQLite volumes are as you left them; Postgres keeps its data in postgres-data."
fi
echo "webhook-gateway stays on SQLite unless your overlay gives it a DATABASE_URL."
