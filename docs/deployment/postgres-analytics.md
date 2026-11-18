# Postgres analytics: setting up read-only SQL access

This page is for operators. It explains how integration-server creates the
views, roles and logins behind [read-only SQL access](../integrate/sql-access.md),
what database privileges that needs, and how the feature interacts with
replicas, backups and upgrades.

It applies only to the **Postgres backend**: `DATABASE_URL` set, with
integration-server's tables (`credentials`, `resources`, `sync_jobs`) in that
database. When admin-api uses the same database, the `tenants` view is added
too. Otherwise it's skipped.

An existing SQLite deployment can move its data onto Postgres first with
`db-copy` or, for the compose stack, `scripts/switch-db.sh postgres --copy`.
See [switching databases](../operations/switching-databases.md).

---

## What gets created

| Object                                       | Kind               | Purpose                                                                                                                                                                     |
| -------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<prefix>_analytics_owner`                   | NOLOGIN role       | Owns every view and function below. Holds `SELECT` on `resources`, a column list of `credentials` that excludes the encrypted `data` column, and `sync_jobs` and `tenants`. |
| `<prefix>_analytics_reader`                  | NOLOGIN group role | Masked logins belong to it. Grants `USAGE` on the masked schemas and `SELECT` on their views.                                                                               |
| `<prefix>_analytics_reader_pii`              | NOLOGIN group role | The same for the unmasked schemas.                                                                                                                                          |
| `<prefix>_sql_<label>_<id>`                  | LOGIN role         | One per SQL principal. It is read-only by default and has `statement_timeout = 60s`, a connection limit and optionally `VALID UNTIL`.                                       |
| `os_analytics_internal`                      | schema             | The mask functions, `visible()`, the principal scope tables, `catalog_versions` and the hmac key. Readers get `USAGE` and `EXECUTE`, never table access.                    |
| `os_analytics_v{N}`, `os_analytics_pii_v{N}` | schemas            | The masked and unmasked views, per catalog version.                                                                                                                         |
| `os_analytics`, `os_analytics_pii`           | schemas            | Stable aliases for the current version.                                                                                                                                     |
| `pgcrypto`                                   | extension          | Needed for `hmac` masks. It's optional: without it, those columns read `[REDACTED]`.                                                                                        |

`<prefix>` is `ANALYTICS_ROLE_PREFIX` (default `os`). **Roles are
cluster-global**, so two deployments that share a Postgres cluster must use
different prefixes. The schemas are per-database and don't collide.

### Security model

- Views are `WITH (security_barrier)` and owned by the NOLOGIN owner role.
  Readers have no privilege on any base table. Row-level security on the tables
  isn't used, because a reader could still see the unmasked `data` column
  through it.
- Each view filters rows through `os_analytics_internal.visible(owner_tenant_id,
vertical)`, a `SECURITY DEFINER` function that looks up `session_user` in the
  principal scope tables. It uses `session_user` rather than `current_user`, so
  `SET ROLE` can't widen what a login sees.
- Every function pins `search_path`, so a reader can't shadow a function or
  operator the mask functions call.
- The hmac key is derived from `STORE_SECRET` with the same HKDF label the admin
  viewer uses, so tokens match across the viewer, exports and SQL. It sits in a
  table only the owner can read. The views join that table directly, and the
  mask functions take the key as an argument, so a reader who calls a mask
  function directly has no key.
- Passwords are generated (40 random characters) and returned once. Roles are
  created with a SCRAM-SHA-256 **verifier**, never the plaintext, so
  `log_statement = 'ddl'` doesn't log a usable password.

---

## Managed mode (recommended)

Set `ANALYTICS_ADMIN_DATABASE_URL` to a role that:

- has `CREATEROLE`;
- owns the store tables, or can `GRANT SELECT` on them;
- can create schemas in the database (`CREATE` on the database). To create
  `pgcrypto`, it must be the database owner (pgcrypto is a trusted extension)
  or a superuser.

The simplest setup is to give the application's own role `CREATEROLE` and use
the same URL for both:

```sql
ALTER ROLE opensteward CREATEROLE;
```

```bash
DATABASE_URL=postgres://opensteward:…@db:5432/opensteward
ANALYTICS_ADMIN_DATABASE_URL=postgres://opensteward:…@db:5432/opensteward
```

On boot, integration-server compares its view catalog with the newest row in
`os_analytics_internal.catalog_versions`. If they differ, it provisions in the
background. Everything runs in one transaction under
`pg_advisory_xact_lock`, so replicas booting together wait for each other, and
the second one finds nothing left to do. Readers see either the old views or
the new ones, never a mix. `POST /admin/analytics/provision` (the admin UI's
**Provision** button) runs the same thing on demand, for example to repair
grants.

Postgres 16 changed how `CREATEROLE` works. A non-superuser can only manage the
roles it created itself. The provisioning script grants the owner role, and
each principal, back to the admin role. That lets the admin create views as the
owner, and end a principal's sessions when rotating or revoking it. So create
the roles with the same admin role every time. If a principal's sessions can't
be ended, the result reports `sessionsTerminated: null`. A revoked login still
loses access on its next statement. After a rotation, sessions that are already
open keep running until they disconnect.

## Manual mode

Leave `ANALYTICS_ADMIN_DATABASE_URL` unset when the application role can't get
`CREATEROLE`, which is common on managed Postgres. integration-server then
**generates SQL for you to run** and never runs it itself:

1. Download the script from `GET /admin/analytics/provision-script` (the admin
   UI's **Download script**). Run it with an admin role, for example
   `psql -v ON_ERROR_STOP=1 -f provision.sql`. It is one transaction. Download
   and run it again after every upgrade that changes the catalog. The status
   route reports `upToDate: false` until you do.
2. Creating, rotating or revoking a principal returns a `script` next to the
   password. Run it the same way. The script contains only the SCRAM verifier,
   never the password. The admin UI records the principal (or its rotation or
   revocation) straight away, whether or not you run the script.

In manual mode the hmac key isn't set, so `hmac`-masked columns read
`[REDACTED]` until a managed provision runs once.

---

## Read replicas

Set `ANALYTICS_READ_HOST` to the host BI tools should use. It is only
advertised; integration-server always provisions against the primary.

- With **physical (streaming) replication**, roles, passwords, views and the
  hmac key all replicate. Point the host at the replica, and analytics load
  stays off the primary.
- **Logical replication** doesn't carry roles, views or functions. Provision
  against the replica database itself. That's a separate deployment as far as
  this feature is concerned, and it needs its own admin URL.

The login's `statement_timeout` of 60 seconds applies on the replica too. On a
hot standby, long queries can also be cancelled by replication conflicts.
Consider `hot_standby_feedback` or `max_standby_streaming_delay`.

---

## Backup and restore

`pg_dump` dumps the schemas, views, functions, `catalog_versions` and the scope
tables. It **doesn't dump roles**, which are cluster-level. After restoring
into a new cluster:

1. Re-provision. In managed mode, restarting integration-server is enough when
   the owner role is missing. Otherwise call `POST /admin/analytics/provision`.
   In manual mode, run a fresh script. This recreates the group roles and the
   grants.
2. The principal logins are gone. Either restore them with
   `pg_dumpall --roles-only` from the old cluster (verifiers included), or
   create new principals in the admin UI and revoke the old records.

See also [backup-restore.md](./backup-restore.md).

---

## Upgrades and catalog versions

The view catalog is generated from the canonical schemas and field
classifications. `pnpm check:analytics-catalog` fails CI when a release would
remove a view or column, or change a column's type, unless
`apps/integration-server/src/analytics/catalog.lock.json` is updated.

When a breaking change deploys, the stable schemas move to `v{N+1}` and
`v{N}` is kept. Additive changes rebuild `v{N}` in place. Only one previous
version is kept, so a query pinned to `v{N-1}` stops working after the next
breaking release.

---

## Warnings the status route reports

- **PUBLIC can CREATE in schema `public`.** This is the default before
  Postgres 15. SQL logins could then create tables there. They still can't read
  anything they shouldn't, but run
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC` as the schema owner.
- **pgcrypto is not installed.** `hmac` masks read `[REDACTED]`.

---

## Removing the feature

Revoke every principal first. Then, as the admin role:

```sql
DROP SCHEMA os_analytics, os_analytics_pii CASCADE;
DO $$ DECLARE s text; BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^os_analytics(_pii)?_v[0-9]+$' LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', s);
  END LOOP;
END $$;
DROP SCHEMA os_analytics_internal CASCADE;
-- then, for each role named <prefix>_sql_* and the three group roles:
-- DROP ROLE …;
```

Unset `ANALYTICS_ADMIN_DATABASE_URL` so the next boot doesn't provision again.
