# Backup + restore

OpenSteward persists state in three named Docker volumes (`admin-data`,
`webhook-data`, `integration-server-data`) plus root-of-repo configuration
(`.env`, the per-service `apps/<svc>/config/config.yml` files). On the
Postgres backend (`DATABASE_URL`) the stores live in that database instead;
with compose's `analytics` profile that is the `postgres-data` volume. The
`https` profile adds `caddy-data`, which holds only Caddy's local CA. Losing
any of the data stores is unrecoverable without a snapshot — there is no
cloud-side backup and the encrypted columns can't be reconstructed.

The bundled `pnpm backup` / `pnpm restore` tools snapshot all of it into
a single `.tar.gz` and put it back. This page is the operator runbook.
Moving a deployment between SQLite and Postgres is a different job:
see [switching databases](../operations/switching-databases.md).

A volume compose has never created — `caddy-data` before the `https` profile
has run, `postgres-data` before `analytics` — holds nothing, so `pnpm backup`
skips it and lists it under `skippedVolumes` in the manifest (and as
`skipped:` in its output). Restore puts back only the volumes the manifest
lists.

## Known defect: the tools only work where the docker daemon is native

Both tools resolve each named volume with `docker volume inspect
<project>_<volume> --format '{{.Mountpoint}}'` and then read or write that
path with ordinary `fs` calls from the host process
(`resolveVolumeHostPath` in `packages/shared/src/scripts/backup.ts`). That
only works when the daemon stores its volumes on the same filesystem the
tool is running on — a Linux host running docker natively. On **Docker
Desktop (macOS and Windows)**, and on any other VM-backed or remote daemon,
the mountpoint is a path *inside the daemon's VM* and does not exist on the
host at all.

`pnpm backup` does not fail in that case. It **silently produces an archive
with no volume data in it**: `copyDirRecursive` returns immediately when the
source path is missing, and `findDbFiles` returns nothing — so the WAL guard
finds nothing to object to and the schema-version scan finds nothing to
record. You get a tarball containing `MANIFEST.json`, `.env`, the
`config.yml` files, and empty `volumes/<name>/` directories, and an exit code
of 0.

**How to tell:** the run summary prints `schema-namespaces: 0`, and
`MANIFEST.json` has `"schemaVersions": {}`. On a healthy backup of a
deployment that has booted at least once, both are non-empty. Check this
every time — it is the only signal.

`pnpm restore` is affected by the same assumption. It has a helper-container
fallback, but that only triggers on a permission error (`EACCES` / `EPERM`);
a mountpoint that simply is not there takes the direct-write path.

**Workaround — snapshot and restore each volume through a helper container**,
which reads the volume from inside the daemon where the path is real:

```bash
# Back up. Volume names are <project>_<volume>; <project> is the lowercased
# basename of this directory unless COMPOSE_PROJECT_NAME is set.
# postgres-data holds compose's analytics-profile Postgres; stop it too
# (docker compose stop postgres) or take a pg_dump instead.
mkdir -p ./backups
TS=$(date -u +%Y%m%dT%H%M%SZ)
for vol in admin-data webhook-data integration-server-data postgres-data; do
  docker volume inspect opensteward_${vol} >/dev/null 2>&1 || continue
  docker run --rm \
    -v opensteward_${vol}:/data:ro \
    -v "$(pwd)/backups:/backup" \
    alpine:3 tar -czf "/backup/${vol}-${TS}.tar.gz" -C /data .
done

# Restore one volume.
docker run --rm \
  -v opensteward_admin-data:/data \
  -v "$(pwd)/backups:/backup:ro" \
  alpine:3 sh -c 'rm -rf /data/* /data/.[!.]*; tar -xzf /backup/<file>.tar.gz -C /data'
```

Stop the services first, exactly as the runbook below says — the helper
container has no more protection against a live writer than the tool does.
The `.env` and `config.yml` files are on the host, so copy those yourself;
that half of the tool's job is not affected.

The rest of this page describes the tools as designed, and is accurate on a
Linux host with a native docker daemon.

## When to run `pnpm backup`

- **Before any upgrade.** Always. `git pull && docker compose up -d --build`
  can run forward-only migrations that change the on-disk schema. If
  anything goes wrong (botched migration, env-var drift, a bug only this
  release introduces), the only way back is a backup.
- **Before rotating `STORE_SECRET`.** The rotation tool already snapshots
  the db files it touches (`.pre-rotation.bak`), but a full backup adds
  `.env`, configs, and the volumes the rotation tool doesn't see.
- **As part of routine ops.** Daily / weekly snapshots stored off-host
  protect against disk failure on the docker host. The tool is
  unattended and produces a single tarball per run.

## When to run `pnpm restore`

- **Disaster recovery.** Volume corruption, host disk failure, accidental
  `docker volume rm`. Restore the most recent backup and bring services
  back up.
- **Downgrade attempt.** A new release exposes a bug your operators
  can't tolerate. Take a fresh backup of the broken state (for forensics),
  `git checkout <prev tag>`, restore the pre-upgrade backup, `docker
  compose up -d --build`.
- **Migrating between hosts.** Backup on the old host, copy the tarball,
  restore on the new host. Manifest records the source git SHA so you
  know exactly which release the data was paired with.

## Commands

### Backup

```bash
# 1. Stop services that have writers attached (admin-api, webhook-gateway,
#    integration-server). The tool refuses to run otherwise. With the
#    `analytics` profile up, stop `postgres` too: the tool checks only for
#    live SQLite writers and would otherwise copy a running Postgres data
#    directory, which is not a consistent snapshot. (Or take a `pg_dump`.)
docker compose stop integration-server admin-api webhook-gateway
# docker compose stop postgres     # only if the analytics profile is running

# 2. Snapshot. Writes backups/opensteward-<ISO timestamp>.tar.gz.
pnpm backup

# 3. Restart services.
docker compose start integration-server admin-api webhook-gateway
```

The tarball contains:

- `MANIFEST.json` — created-at timestamp, git SHA, per-service `/version`
  if reachable (recorded as `"unknown"` otherwise), per-namespace schema
  version from `_schema_migrations`, tool version + format.
- `volumes/<volname>/...` — every named volume's contents.
- `.env` (if present at repo root).
- `apps/<svc>/config/config.yml` (each that exists).

### Restore

```bash
# 1. Stop services.
docker compose stop

# 2. Inspect the manifest first if you're unsure which file to use.
pnpm restore backups/opensteward-2026-01-15T12-00-00-000Z.tar.gz --manifest-only

# 3. Restore. By default, .env and config files at the repo root are
#    NOT overwritten — the tool errors if they exist. Pass --force to
#    overwrite them from the tarball.
pnpm restore backups/opensteward-2026-01-15T12-00-00-000Z.tar.gz
# or, to also overwrite .env and configs:
pnpm restore backups/opensteward-2026-01-15T12-00-00-000Z.tar.gz --force

# 4. Bring services up.
docker compose up -d
```

The restore tool replaces each volume's contents wholesale — anything
written to a volume after the backup was taken is gone. If you need
to merge two backups, untar both into a workspace and copy the bits
you want manually, then restore the merged tree.

## Guards

- **Refuses while services are up.** Both tools check every `.db` file
  inside the target volume mounts for a `-wal` / `-shm` sibling
  modified within the last 60 seconds (the same guard
  `rotate-store-secret` uses). A live writer means corruption-on-snapshot
  is possible; stop services first.
- **Refuses to overwrite root files without `--force`.** Restoring an
  `.env` from a stale backup over a freshly-rotated one would invalidate
  every encrypted column on next boot. `--force` is explicit.
- **Refuses unknown manifests.** Tarballs without a top-level
  `MANIFEST.json`, or with `tooling.tool !== 'opensteward-backup'`, or
  with a `format` higher than this restore tool understands, are
  rejected with a clear error.

## Manifest fields

```json
{
  "createdAt": "2026-01-15T12:00:00.000Z",
  "gitSha": "abc1234567890",
  "serviceVersions": {
    "admin": "1.4.0",
    "admin-api": "1.4.0",
    "docs-server": "1.4.0",
    "webhook-gateway": "1.4.0",
    "integration-server": "1.4.0"
  },
  "schemaVersions": {
    "volumes/admin-data/admin.db": { "admin_users": 3, "audit_log": 2 },
    "volumes/integration-server-data/credentials.db": { "credentials": 4 }
  },
  "volumes": ["admin-data", "webhook-data", "integration-server-data", "caddy-data", "postgres-data"],
  "configFiles": ["apps/admin/config/config.yml", "apps/admin-api/config/config.yml"],
  "envIncluded": true,
  "tooling": { "tool": "opensteward-backup", "toolVersion": "0.1.0", "format": 1 }
}
```

Use `pnpm restore <tarball> --manifest-only` to print the manifest
without unpacking anything else.

## Storage location

`backups/` is git-ignored at the repo root. Move the tarballs off the
docker host to durable storage (object storage, NAS, a workstation —
anywhere that survives the host going down) as soon as you're confident
the backup completed. The tool does not delete old backups; rotate them
out with whatever retention policy your environment requires.

## Data access: what else to back up

The data viewer, dashboards, destinations and SQL access keep state in a few
places the volume snapshot does and does not reach.

- **`resources.db` carries destination state.** The `integration-server-data`
  volume holds `resources.db` next to `credentials.db`, and with it the
  destinations (their encrypted credentials) and each destination's export
  cursors. Restoring a snapshot rewinds those cursors with the records: the
  next run re-exports every row that changed after the snapshot was taken, and
  Parquet destinations get those rows again in new files. Delivery is at
  least once anyway, so consumers already deduplicate on `_pk` keeping the
  greatest `changed_at`, and the Postgres sink and warehouse loaders do so
  themselves (see [destinations](../integrate/destinations.md#delivery-is-at-least-once)).
  Records deleted after the snapshot come back with it until the next full
  sync of their connection sweeps them out again, which writes fresh
  tombstones for the destinations to apply. Restore both files from the same
  snapshot; never one without the other.
- **Postgres deployments are not covered by `pnpm backup`.** With
  `DATABASE_URL` set, every store lives in that database, and the tools here
  only snapshot the SQLite volumes (plus `.env` and configs, which you still
  want). Use `pg_dump` (or your provider's snapshots) for the database.
- **`pg_dump` does not include roles.** Read-only SQL access creates
  cluster-level roles: the owner and group roles and one login per SQL
  principal. After restoring into a new cluster, re-provision SQL access
  (**Re-provision** at `/sql-access`, or `POST /api/sql-access/provision`) to
  recreate the group roles and grants, and either restore the logins with
  `pg_dumpall --roles-only` from the old cluster or create new principals and
  revoke the old records. Details in
  [postgres-analytics.md](./postgres-analytics.md#backup-and-restore).
- **Superset's metadata database is separate.** When embedded Superset is
  deployed, its own database (`SUPERSET_METADATA_DB_URI`) holds the
  dashboards and charts authors built. Back it up with the rest; the
  bootstrap job can recreate the connection, datasets, default dashboards and
  the registry, but not their work. Restoring it needs the same
  `SUPERSET_SECRET_KEY`. See [superset.md](./superset.md).
- **Files already in your lake are yours.** A restore on the OpenSteward side
  never removes or rewrites files a destination has written.

## Test-only flags

`--volumes-base <path>` short-circuits the `docker volume inspect` step
and resolves each named volume to `<path>/<volname>` on the host
filesystem instead. This lets unit tests exercise the full backup/
restore path without a running docker daemon. **Do not use in production
operations** — there is no real upgrade benefit and a typo in the path
silently snapshots the wrong directory.
