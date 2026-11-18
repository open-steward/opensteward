# Switching databases: SQLite ⇄ Postgres

Every OpenSteward service picks its database at boot: Postgres when
`DATABASE_URL` is set, SQLite otherwise. Moving a deployment from one to the
other used to mean starting over on an empty database. Two tools carry the
data across:

- **`scripts/switch-db.sh`** moves the local compose stack in one command:
  it checks and confirms the copy while the stack keeps running, stops it,
  copies every service database (with `--copy`), and starts the stack in the
  other mode.
- **`db-copy`** (`node dist/db-copy.js` in each service image) copies one
  service database between the backends, in either direction. The script
  runs it for you; you can also run it yourself, for Kubernetes or a
  non-compose deployment.

## The databases

| Service            | SQLite file (default path, from the service's config) | `--db`        | On Postgres                          |
| ------------------ | ----------------------------------------------------- | ------------- | ------------------------------------ |
| admin-api          | `./data/admin.db` (`db.path` in `config.yml`)         | `admin`       | the `DATABASE_URL` database          |
| integration-server | `./data/credentials.db` (`storePath`, `STORE_PATH`)   | `credentials` | the same database                    |
| integration-server | `./data/resources.db` (`DATA_STORE_PATH`)             | `resources`   | the same database                    |
| webhook-gateway    | `./data/webhook-gateway.db` (`db.path`)               | `webhook`     | only if you give it a `DATABASE_URL` |

Relative paths resolve from the service's directory in its image
(`/app/apps/<service>`), as the service resolves them. On Postgres, admin-api's
and integration-server's tables share one database (the analytics overlay
points both at `opensteward`); each copy touches only its own tables, and a
test keeps every profile's tables and migration namespaces disjoint. The
analytics overlay leaves webhook-gateway on SQLite, so the script leaves its
database alone unless your overlay moves it too.

## Switching the compose stack

Build the images from a checkout that has `db-copy` first — the script builds
nothing. On a small Docker VM build one image at a time
(`COMPOSE_PARALLEL_LIMIT=1`, then `docker compose … build admin-api`, then
`… build integration-server`). Then rehearse, then switch:

```bash
scripts/switch-db.sh postgres --copy --dry-run   # print every command, run none
scripts/switch-db.sh postgres --copy             # SQLite volumes → Postgres
scripts/switch-db.sh sqlite --copy               # Postgres → SQLite volumes
scripts/switch-db.sh sqlite                      # switch back, copy nothing
```

In order, the script:

1. **With `--copy`, checks everything while the stack keeps running.** It
   starts `postgres` if it is not running, checks each image has
   `dist/db-copy.js`, and runs `db-copy --dry-run` for every database that
   moves — schema check and row counts, nothing written. Any refusal ends the
   script here. A database with nothing to copy (exit 5, e.g. no resources
   database under `DATA_STORE_MODE=passthrough`) ends it too, unless
   `--skip-missing`; skipped databases are listed. Then it asks you to type
   `yes` (`--yes` skips the prompt; without a terminal and without `--yes`
   it refuses before doing anything). **Cancelling leaves the stack exactly as
   it was** — a `postgres` started only for the checks is stopped again.
2. **Stops the whole stack** with `docker compose stop` — never `down`, never
   `-v`; no container or volume is removed. Superset stops too, so nothing
   holds a connection to a database about to be rewritten.
3. **Copies.** Before overwriting Postgres it dumps it with `pg_dump -Fc`
   inside the `postgres` container to `~/.opensteward/db-backups/`
   (`SWITCH_DB_BACKUP_DIR`), a directory it creates — or tightens — to `0700`,
   the file `0600`. Then, for each database, `db-copy --overwrite` runs in a
   one-off container of that service's image (`docker compose run --rm
--no-deps`), with its SQLite volume mounted and on the compose network.
   `DATABASE_URL` comes from the service's Postgres-mode environment and is
   read by `db-copy` itself (`env:DATABASE_URL`), so it never appears in a
   command line. Copying into SQLite, `db-copy` snapshots each existing file
   next to itself as `<file>.pre-copy-<time>.bak` (owner-only, `0600`),
   inside the volume, and after a successful copy keeps only the newest three
   per file — `--keep-backups N` to keep more or fewer. A copy that fails
   prunes nothing.
4. **Starts the stack** in the target mode: `docker-compose.yml`, plus
   `docker-compose.analytics.example.yml` (`--overlay` for your own) and the
   `analytics` profile in Postgres mode, plus `docker-compose.override.yml`
   when it exists — any `-f` turns off compose's automatic loading of it, so
   the script always passes it explicitly. Profiles whose containers exist
   (`sso-dev`, `https`, `scale`) are kept; `--profiles "sso-dev https"`
   overrides the detection. It prints what it did.

If anything fails after the stop, the script **restarts the stack in the mode
it was in** — its databases are untouched, since a copy only ever writes to
the target — and says so. The exception is a **same-mode refresh** (already on
Postgres, running `postgres --copy`; or on SQLite, running `sqlite --copy`):
there the previous mode's database _is_ the target, and a failure partway
through the list leaves it partly overwritten. The script then **leaves the
stack stopped**, prints the exact restore command for the dump it took a
moment earlier (`docker compose … exec -T postgres pg_restore -U opensteward
--clean -d opensteward < <dump>`) — or, for SQLite, points at the
`.pre-copy-<time>.bak` snapshot next to each file — and exits non-zero. Without `--copy`, each backend keeps whatever it
held: the SQLite volumes are never modified by a switch, and Postgres keeps
its `postgres-data` volume.

The SQLite paths come from the files `docker-compose.yml` mounts into the
services (`apps/admin-api/config/config.yml`,
`apps/integration-server/config/config.example.yml`,
`apps/webhook-gateway/config/config.yml`) and, inside the container, from
`STORE_PATH` / `DATA_STORE_PATH` as the service reads them.

## Running db-copy yourself

```bash
# In a service container (or `pnpm --filter admin-api db-copy -- …` in a checkout)
node dist/db-copy.js --from sqlite:./data/admin.db --to env:DATABASE_URL --dry-run
node dist/db-copy.js --from sqlite:./data/admin.db --to env:DATABASE_URL
node dist/db-copy.js --db credentials --from env:DATABASE_URL \
  --to sqlite:./data/credentials.db --overwrite
```

Stop the service whose database you copy. Endpoints are `sqlite:<path>`, a
`postgres://` URL, or `env:<NAME>` (the URL in that variable). integration-
server has two databases, so it needs `--db credentials` or `--db resources`;
`--list` shows them.

| Option               |                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`          | check both sides, print the row count of every table and what would be backed up; write nothing                                                                                                                                                |
| `--overwrite`        | replace a target that holds any row in this database's tables                                                                                                                                                                                  |
| `--no-backup`        | skip the backup taken before writing to an existing target: the snapshot of a SQLite file, or the `pg_dump` of a Postgres target that holds rows. Without `pg_dump` on `PATH` (the service images have none) such an overwrite needs this flag |
| `--keep-backups <n>` | snapshots of a SQLite target to keep per file, newest first (default 3); older ones are deleted after a successful copy, never after a failed one                                                                                              |
| `--backup-dir <dir>` | where the `pg_dump` goes (default: the SQLite source's directory, else the current one)                                                                                                                                                        |
| `--ignore-unknown`   | copy a SQLite source that also holds tables the profile does not know (they are not copied)                                                                                                                                                    |
| `--batch-size <n>`   | rows per batch (default 500)                                                                                                                                                                                                                   |

| Exit | Meaning                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0    | copied (or the dry run found nothing to refuse)                                                                                 |
| 1    | failed and rolled back — including a row-count mismatch; the target's rows are unchanged                                        |
| 2    | usage error                                                                                                                     |
| 3    | refused: the target holds rows; add `--overwrite`                                                                               |
| 4    | refused: schema versions or tables differ (see below)                                                                           |
| 5    | nothing to copy: the source file is missing or holds no schema for this database                                                |
| 6    | refused: overwriting a Postgres target with rows needs a backup and `pg_dump` is not available — back it up, then `--no-backup` |

## How the copy works

**The schema comes from the service, not from the source.** Each service's
entry point (`apps/<service>/src/db-copy.ts`) lists the stores its
`buildServer()` opens on that database — the same `XStore.create(handle, …)`
calls. `db-copy` runs them once against a scratch in-memory SQLite database
through a handle that records every `migrate(namespace, migrations)` call. That
yields, from the build that is running, every migration namespace with its
exact `DualMigration` list and the tables those migrations create (the copy
set). Nothing about the schema is written down twice, so a new migration needs
no change here. A test per service fails when `server.ts` hands a database
handle to anything — positionally, in an object literal, or to a constructor —
that the profile neither opens nor lists as a deliberate exclusion.

The target is then brought to exactly those versions **through the service's
own migrator** (`DbHandle.migrate()`), so it gets the same DDL the service
would create at boot — not a translation of the source's. This does not depend
on the service having booted against the target first. The copy **refuses**
(exit 4) when:

- the source's `_schema_migrations` version differs from this build's for any
  namespace — boot the service once against the source with this build (that
  migrates it forward), or copy with the image that last wrote it;
- the target's schema is newer than this build;
- a SQLite source holds a table or namespace the profile does not know — its
  rows would be left behind. If a store was added to the service, add it to
  the profile; if the tables are obsolete, `--ignore-unknown`.

`_schema_migrations` itself is never copied: the target writes its own rows
while migrating, and the versions are compared instead.

**Nothing is replaced on a guess.** Any row in any of the database's tables
means the target holds data and needs `--overwrite` — even the rows a freshly
started service creates by itself (the `default` tenant, built-in roles,
setting defaults); the refusal says when that is all it found. Before the
first write an existing SQLite target file is always snapshotted (owner-only;
the newest three per file are kept, `--keep-backups`), and a
Postgres target holding rows is dumped (`pg_dump --format=custom` of this
database's tables, the connection passed through `PG*` environment variables,
never on the command line), or the copy refuses with exit 6.

**One transaction.** The source is read from one snapshot (a SQLite read
transaction, or a Postgres `REPEATABLE READ READ ONLY` transaction). The
target gets one transaction: clear the profile's tables (`TRUNCATE` on
Postgres, without `CASCADE`), copy them parents-first by foreign key in
batches, fix the sequences, count every table, and commit only if every count
equals the source's. Anything else rolls back and leaves the target's rows as
they were.

**Sequences.** Ids are copied as they are (`OVERRIDING SYSTEM VALUE` for
`GENERATED ALWAYS AS IDENTITY` columns such as `audit_log.id`). Afterwards
every serial or identity sequence on Postgres (`setval`) and every
`AUTOINCREMENT` counter on SQLite (`sqlite_sequence`) is moved past both the
largest copied id and the source's own high-water mark, so an id handed out
and deleted before the copy is not handed out again — `resource_tombstones.id`
is a change-feed cursor that relies on that. A Postgres sequence is only ever
raised, never lowered: `setval` is not undone by a rollback, so lowering it in
a copy that then rolled back would leave it behind the target's own ids.

**Values.** SQLite integers are read as 64-bit (a value above 2^53 survives),
Postgres `bigint`, `numeric`, JSON and timestamps as their exact text, then
converted per target column: `INTEGER` 0/1 ⇄ `BOOLEAN`, `BLOB` ⇄ `BYTEA` (logo
and avatar bytes), JSON text ⇄ `JSONB`, `NULL` stays `NULL`. Encrypted columns
(connection credentials, API-key secrets, SSO secrets) are base64 `TEXT` on
both backends and are copied byte-for-byte, so both sides must use the **same
`STORE_SECRET`** — they do when they share one `.env`.

**Nothing secret is printed.** Output is table names and row counts; a
Postgres URL is shown as host, port and database only; driver errors are
reduced to their message, SQLSTATE and constraint or column name, never the
row they were about.

## What is not copied

- **SQL-access principals** (integration-server's `analytics` namespace) exist
  only on Postgres and describe Postgres roles. They stay in Postgres when you
  switch back to SQLite and are there again when you return.
- **Superset's own metadata** lives in its separate `superset` database and is
  untouched.
- **webhook-gateway's captured webhooks**, unless your Postgres overlay gives
  webhook-gateway a `DATABASE_URL`.

## Going back

- `scripts/switch-db.sh sqlite` (no `--copy`) returns to the SQLite volumes as
  they were before the last copy _into_ them.
- A SQLite file that `db-copy` overwrote sits next to its snapshots,
  `<file>.pre-copy-<time>.bak` (the newest three by default), in the same
  volume; copy one back over the file with the stack stopped.
- A Postgres database that the script overwrote was dumped first. Restore it
  from the repository root, with the same `-f` files and profiles the script
  printed (add `-f docker-compose.override.yml` when you have one):

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.analytics.example.yml \
    --profile analytics exec -T postgres \
    pg_restore -U opensteward --clean -d opensteward \
    < ~/.opensteward/db-backups/opensteward-postgres-<time>.dump
  ```

  Stop the services first (`… stop admin-api integration-server superset`) so
  nothing holds the tables.

See also: [Embedded Superset](../deployment/superset.md) ·
[Postgres analytics](../deployment/postgres-analytics.md) ·
[Backup and restore](../deployment/backup-restore.md).
