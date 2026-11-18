# Upgrade runbook

This is the standard procedure for moving a self-hosted OpenSteward
deployment from version *N* to version *N+1*. It assumes the
docker-compose deployment shipped in this repo; adapt step 3 (Pull
new code) for git-fetch-and-checkout, mirror sync, etc.

For version-specific caveats (env vars to add, secrets to rotate,
breaking changes), read the target release's notes in
[`CHANGELOG.md`](../../CHANGELOG.md) **before** starting this runbook.

A related runbook covers offline secret rotation:
[`docs/deployment/key-rotation.md`](./key-rotation.md). The two
procedures compose — if you're rotating `STORE_SECRET` as part of
an upgrade, do the rotation first while you're already in the
maintenance window.

## Pre-flight

You should have:

- The current deployment running and healthy
  (`docker compose ps` shows everything as `running`, no recent
  restarts in `docker compose logs --since=1h`).
- An operator account with the `admin` role.
- 10–15 minutes of low-traffic time. The upgrade itself is fast
  (under a minute for the rebuild on most laptops); the buffer is for
  the backup + verification steps either side.

## Step 1 — Snapshot the data volumes

`pnpm backup` snapshots every named volume in `docker-compose.yml` plus
`.env` and the per-app `config.yml` files into one tarball with a
manifest. Volumes a profile has never created (`caddy-data`,
`postgres-data`) are skipped and listed in the manifest.
Stop the services first — it refuses to run while a writer is attached:

```sh
docker compose stop integration-server admin-api webhook-gateway
pnpm backup
docker compose start integration-server admin-api webhook-gateway
```

**Check the output before trusting it.** On Docker Desktop and any
other VM-backed docker daemon, `pnpm backup` produces an archive with
no volume data in it and still exits 0 — the summary line
`schema-namespaces: 0` is how you spot it. Full explanation and the
supported workaround are in [`backup-restore.md`](./backup-restore.md).
On such a host, snapshot the volumes through a helper container
instead:

```sh
mkdir -p ./backups
TS=$(date -u +%Y%m%dT%H%M%SZ)
for vol in admin-data webhook-data integration-server-data postgres-data; do
  docker volume inspect opensteward_${vol} >/dev/null 2>&1 || continue
  docker run --rm \
    -v opensteward_${vol}:/data \
    -v "$(pwd)/backups:/backup" \
    alpine tar -czf "/backup/${vol}-${TS}.tar.gz" -C /data .
done
```

On the **Postgres backend** (`DATABASE_URL` set) the stores live in the
database, not in the SQLite volumes: take a `pg_dump` as well (the loop's
`postgres-data` copy is only consistent with `postgres` stopped). Switching
backends is not part of an upgrade; it has its own runbook,
[switching databases](../operations/switching-databases.md). If you use
read-only SQL access, note that `pg_dump` does not include its roles —
see [`backup-restore.md`](./backup-restore.md#data-access-what-else-to-back-up).

Either way, these archives are the rollback path. Treat them as the
only thing between you and a bad upgrade.

## Step 2 — Review what's changing

```sh
git fetch origin
git log --oneline HEAD..origin/main
```

Skim:

1. [`CHANGELOG.md`](../../CHANGELOG.md) — what's in the new version,
   including anything you have to do by hand.

If the release notes call out manual actions for your version pair,
do them now. Skipping is the easiest way to brick the upgrade.

## Step 3 — Pull new code

```sh
git pull --rebase
```

If you've customised `docker-compose.yml` locally (port mappings,
extra env, custom networks), expect a conflict here. The standing
recommendation is to move every operator customisation into
`docker-compose.override.yml` (git-ignored) — that file is reserved
for your changes; the base `docker-compose.yml` only ships
upstream-tracked defaults. Copy `docker-compose.override.example.yml`
to `docker-compose.override.yml` and uncomment the blocks you need —
Compose merges it automatically on a plain `docker compose up -d`, so
no `-f` flags are required. Inspect the merged result with
`docker compose config`.

## Step 4 — Rebuild + restart

```sh
export GIT_SHA=$(git rev-parse --short HEAD)
export BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose up -d --build
```

Setting `GIT_SHA` + `BUILD_TIME` here is how those values reach
`/version` at runtime. Skip them in dev — `/version` will report
`"dev"` for both fields, which is fine.

Tail logs for the first 30 seconds:

```sh
docker compose logs -f --since=1m
```

Look for one `[migrate:<namespace>] applied version <N>` line per
schema change. A boot with no schema changes shows no such lines —
that's expected and means the new binary's schema matched what was
already in the volume.

Some migrations are followed by background work that does not block
boot — for example the data store's `changed_at` backfill, which logs
`data-store: backfilled changed_at on <n> row(s)` when it finishes. The
release's **Upgrade notes** in `CHANGELOG.md` list these, along with any
default that changed (such as the tenant scope of newly created identity
providers).

## Step 5 — Verify

Three quick checks:

```sh
# /version on every service. Each should return the new release and gitSha.
for port in 3000 3001 3003 3004 3010; do
  echo "--- :${port}"
  curl -s "http://localhost:${port}/version"
  echo
done
```

In the admin UI:

- The sidebar footer shows the new release, for example
  `OpenSteward 0.2.0`.
- The **System** page shows that release, with every service
  **Running** and no warning. A "different releases" warning means a
  service still runs the old image; a "not responding" one names a
  service that did not come back.

Migrations need no separate check: each service applies its own when it
starts, and a failed migration stops that service from starting, so it
shows as not responding. For the applied rows themselves (developer
detail), `GET /api/schema-status` on the admin UI lists them.

Then run the preflight:

```sh
pnpm run doctor
```

(`pnpm run doctor`, not `pnpm doctor`: the latter is pnpm's own built-in
command, which checks nothing here.) It re-checks every env var, config
file, and encrypted-blob smoke decrypt against the new binary's
expectations, plus volume disk headroom, and reports the license
integration-server will run under. It writes nothing, and exits 1 if any
check reports `FAIL` (the license check never does).

## Step 6 — Post-upgrade tasks

Re-read the release notes in `CHANGELOG.md` for the versions you just
walked. Any "Recommended" or "Optional" actions live there.

## Rollback

If `Step 5` finds something broken:

```sh
docker compose down
git reset --hard <previous-tag>
# Restore from the Step-1 backup. From a `pnpm backup` tarball:
#   pnpm restore backups/opensteward-<timestamp>.tar.gz
# From helper-container archives, reverse the docker run line:
#   docker run --rm -v opensteward_<vol>:/data -v "$(pwd)/backups:/backup" \
#     alpine sh -c 'rm -rf /data/* && tar -xzf /backup/<file>.tar.gz -C /data'
docker compose up -d --build
```

Forward-only schema migrations mean rolling back a binary that
applied a new migration **requires** restoring the volume from the
pre-upgrade backup. Pulling an older binary against a newer schema
boots into a hard fail (`applyMigrations` refuses to run when the
database is at a higher version than the binary knows about), which
is the safer of the two failure modes.
