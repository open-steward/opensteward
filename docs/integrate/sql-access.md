# Read-only SQL access: connect a BI tool to your synced records

OpenSteward can give a BI tool, a notebook or a warehouse loader a **read-only
Postgres login** onto the records it has synced. The login sees a set of views,
one per resource type, with typed columns, personal data masked by default, and
only the tenants and verticals it was granted.

It needs the **Postgres backend** (`DATABASE_URL`) and the data store
(`DATA_STORE_MODE` other than `passthrough`). On SQLite, every SQL-access route
answers `409 POSTGRES_REQUIRED`. Use [destinations](./destinations.md) there
instead. Setting the feature up is covered in
[deployment/postgres-analytics.md](../deployment/postgres-analytics.md).

---

## Get a login

An operator with the `sql_access:manage` permission creates an **SQL principal**
in the admin UI (or through admin-api). They choose:

| Setting          | Meaning                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Label            | A name for the login, such as "Metabase prod". It becomes part of the username.                       |
| Tenants          | The owner tenants whose connections it sees, or all tenants. It can't exceed the creator's own scope. |
| Verticals        | Optional. Limit it to some verticals, such as `crm` or `payments`.                                    |
| Unmasked (PII)   | Off by default. When on, the login reads the unmasked schema. The creator needs `data:read_pii`.      |
| Expiry           | Optional. After this time Postgres refuses the login (`VALID UNTIL`).                                 |
| Connection limit | Concurrent sessions allowed. The default is 5.                                                        |

The response shows the **password once**. OpenSteward never stores it. Only
Postgres keeps a SCRAM verifier. If you lose the password, rotate it.

The username looks like `os_sql_metabase_prod_3f9a1c`. The host is the one your
operator advertises (`ANALYTICS_READ_HOST`, often a read replica). The database
is the deployment's Postgres database.

```bash
psql "postgresql://os_sql_metabase_prod_3f9a1c:<password>@replica.internal:5432/opensteward?sslmode=require"
```

```sql
SELECT platform, count(*) FROM crm_contacts GROUP BY 1;
```

### BI tools

- **Metabase, Superset, Redash, Grafana, Lightdash:** add a PostgreSQL data
  source with the host, database, username and password. The login's
  `search_path` already points at the right schema, so the tables show up
  without a schema prefix. If the tool asks for a schema, use `os_analytics`,
  or `os_analytics_pii` for an unmasked login.
- **Tableau, Power BI, Looker:** use their PostgreSQL connector the same way.
  Views appear as tables.
- **dbt:** point a `postgres` profile at the login and declare the views as
  sources in schema `os_analytics`. The login is read-only, so build your
  models in another database.
- **Warehouse loaders** such as Airbyte or Fivetran: use a Postgres source with
  standard (query-based) replication. Logical replication (CDC) isn't
  available, because the login can't read the underlying tables.

---

## Schemas and versions

| Schema                                       | Holds                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `os_analytics`                               | The masked views for the current catalog version. Use this one.                             |
| `os_analytics_pii`                           | The same views, unmasked. Only unmasked (PII) logins can read it.                           |
| `os_analytics_v{N}`, `os_analytics_pii_v{N}` | The views of catalog version _N_. The stable schemas above are aliases for the current _N_. |

A new OpenSteward release can add views and columns without changing _N_.
When a release **removes** a view or column, or **changes a column's type**, the
deployment provisions version _N+1_, points the stable schemas at it, and keeps
version _N_ next to it. A query pinned to `os_analytics_v1.crm_contacts` keeps
working while you migrate it. Only the current and the previous version are
kept. `pnpm check:analytics-catalog` catches such changes in CI, and they are
called out in the release notes.

Masking always follows the current classification, in every kept version. An
old version never shows more than the current one.

---

## Views

There is one view per stored resource type, named `<vertical>_<resource_type>`
in snake_case: `crm_contacts`, `payments_charges`, `customer_support_tickets`,
`inventory_purchase_orders`, and so on. The full list with column types is in
the admin UI's catalog browser, and in
`apps/integration-server/src/analytics/catalog.lock.json`.

Every resource view starts with the same columns:

| Column            | Type        | Meaning                                                                                                           |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `connection_id`   | text        | The OpenSteward connection the record came from.                                                                  |
| `owner_tenant_id` | text        | The tenant that owns that connection. It is null for connections with no owner, which only all-tenant logins see. |
| `platform`        | text        | The platform slug, such as `hubspot`.                                                                             |
| `vertical`        | text        | The vertical, such as `crm`.                                                                                      |
| `resource_id`     | text        | The record's id on the platform.                                                                                  |
| `fetched_at`      | timestamptz | When OpenSteward last fetched the record.                                                                         |
| `updated_at`      | timestamptz | When OpenSteward last wrote the row. A full sync rewrites it even when nothing changed.                           |
| `changed_at`      | timestamptz | When the record's content last changed. Use this for incremental loads.                                           |
| `norm_version`    | text        | Which normalizer produced the stored shape.                                                                       |

Then there is one column per top-level field of the canonical schema, in schema
order:

| Field type                                                                      | Column type   |
| ------------------------------------------------------------------------------- | ------------- |
| string                                                                          | `text`        |
| ISO datetime, or a string field named `*_at`, `*At`, `*date`, `*Date` or `*_on` | `timestamptz` |
| ISO date                                                                        | `date`        |
| number                                                                          | `numeric`     |
| boolean                                                                         | `boolean`     |
| enum                                                                            | `text`        |
| object, array, record, union of mixed types                                     | `jsonb`       |

Some fields are renamed:

- Names are snake_cased: `billingAddress` becomes `billing_address`.
- A field that clashes with a store column gets a `record_` prefix. For example,
  the record's own `updated_at` becomes `record_updated_at`.
- Secret fields have no column at all.

A value that doesn't parse as the column's type reads as `NULL` instead of
failing your query.

The last column, `data` (jsonb), is the whole record after masking, including
fields the schema doesn't list.

Three more views describe the deployment:

| View          | Columns                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connections` | `connection_id`, `owner_tenant_id`, `platform`, `vertical`, `label`, `created_at`, `updated_at`, `expires_at`, `last_refresh_at`, `last_refresh_status`. Credentials are never exposed. |
| `sync_status` | Sync jobs: `job_id`, `connection_id`, `owner_tenant_id`, `vertical`, `platform`, `status`, `progress` (jsonb), `created_at`, `started_at`, `completed_at`.                              |
| `tenants`     | `tenant_id`, `name`, `created_at`, `updated_at`. This view only exists when admin-api shares the database.                                                                              |

---

## Masking

Masking uses the same field classification as the admin data viewer (see
[security/data-classification.md](../security/data-classification.md)). The SQL
functions produce the same output as `mask.ts`, and a CI test checks this.

| Class                | Masked login (`os_analytics`)                                                     | Unmasked login (`os_analytics_pii`) |
| -------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| `public`, `internal` | Shown.                                                                            | Shown.                              |
| `financial`          | Shown. The deployment's `mask_financial` setting doesn't apply to SQL access yet. | Shown.                              |
| `pii`                | Masked, as the table below shows.                                                 | Shown.                              |
| `secret`             | Removed.                                                                          | Removed.                            |

| Mask      | Example                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `email`   | `jane.doe@acme.example` becomes `j***@acme.example`                                                                    |
| `phone`   | `+1 (415) 555-0123` becomes `+* (***) ***-**23`                                                                        |
| `name`    | `Jane Ann Doe` becomes `J*** A*** D***`                                                                                |
| `address` | Every part becomes `***` except `country` and `countryCode`.                                                           |
| `redact`  | `[REDACTED]`                                                                                                           |
| `hmac`    | A 16-character hex token. The same input always gives the same token, so you can join on it, but you can't reverse it. |

Columns that hold masked scalars are typed `text` in the masked views, because
the mask turns them into strings. For example, a PII `date` column is `text` in
`os_analytics` and `date` in `os_analytics_pii`.

The upstream payload (`metadata`, `raw`) counts as PII unless its vertical
classifies it otherwise. Payments `raw` and accounting `metadata` never reach
SQL at all, in either schema, because they can carry bank and card identifiers.

A filter on a masked column compares against the masked value. For example,
`WHERE email = 'jane.doe@acme.example'` matches nothing in `os_analytics`.
That's deliberate: a filter can't be used to confirm what the mask hides.

---

## Scope

Rows are filtered **inside** the views by the login's scope. It doesn't matter
how the query is written, or whether the session runs `SET ROLE`:

- a login scoped to tenants sees connections owned by those tenants;
- a vertical-scoped login sees only those verticals;
- connections with no owner tenant are visible only to all-tenant logins.

A scope change takes effect on the login's next query.

---

## Limits

- **Read-only.** Sessions default to read-only transactions, and the login has
  no write privilege on anything, even if the session turns that default off.
- **No base tables.** `public.resources`, `public.credentials` and the internal
  schema are `permission denied`.
- **Statement timeout** of 60 seconds, **idle-in-transaction timeout** of 5
  minutes, and the connection limit set when the login was created.
- Heavy queries run on the database OpenSteward uses. Operators can point
  `ANALYTICS_READ_HOST` at a read replica to keep them apart.

---

## Rotation and revocation

- **Rotate** creates a new password and returns it once. The old password stops
  working immediately, and open sessions are ended.
- **Revoke** removes the login's ability to log in, its group membership and its
  scope, and ends its open sessions. The record stays in the admin UI's list,
  marked `revoked`. Its username is never reused.

---

## From the console

Operators with the `sql_access:manage` permission (admins by default) find
**SQL access** in the admin console's Admin group (`/sql-access`):

- **Status**: the backend, managed or manual mode, the deployed catalog
  version and whether it's up to date, the advertised read host, and any
  warnings. In managed mode a **Provision now** (or **Update views**) button
  provisions on the spot. In manual mode the provisioning script is shown in
  full with a **Copy** button, to run as a role with `CREATEROLE`.
- **Logins**: every principal in your scope with its tenants, verticals,
  masked or unmasked access, expiry, last rotation and status. Active logins
  have **Rotate** and **Revoke** buttons, both confirmed first.
- **New login**: a label, the tenants and verticals (limited to your own
  scope), an optional expiry date and a connection limit. The **Unmasked**
  option appears only if you hold `data:read_pii`.
- **The password page**: after a create or a rotation, the password is shown
  once, next to ready-made `psql` and JDBC connection strings for the read
  host (or the database host when no `ANALYTICS_READ_HOST` is set). The page
  isn't cached and can't be reopened. In manual mode it also shows the SQL an
  operator must run for the change to take effect.
- **Catalog**: every view with its columns, their types in the masked and
  unmasked schemas, and their classification. It is shown to holders of
  `data:read`.

On a SQLite deployment the page explains that SQL access needs the Postgres
backend and links to the setup guide.

The console calls admin-api's `/api/sql-access/*` routes. admin-api checks the
permissions, sends your scope, and sends the right to create an unmasked login
only if you hold `data:read_pii`. It audits `sql_access.provision`,
`sql_access.principal_create`, `sql_access.principal_rotate` and
`sql_access.principal_revoke`. Passwords never appear in the audit log.

---

## Reference: integration-server routes

admin-api proxies these routes. They sit behind the deployment admin secret.
admin-api passes the operator's data scope in the `X-OpenSteward-Data-Scope`
header, the same way as for `/admin/data/*`. Responses use the
`{ "data": … }` and `{ "error": { "code", "message" } }` envelopes.

| Route                                         | Purpose                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/analytics/status`                 | Returns `backend` (`postgres`/`sqlite`), `mode` (`managed`/`manual`), `provisioned`, `version`, `hash`, `catalogHash`, `upToDate`, `readHost`, `database`, `pgcrypto` and `warnings`. It also answers on SQLite. |
| `GET /admin/analytics/catalog`                | Returns the views and columns, with class and mask, filtered to the scope's verticals.                                                                                                                           |
| `POST /admin/analytics/provision`             | Provisions now (managed mode only). It needs an all-tenant scope.                                                                                                                                                |
| `GET /admin/analytics/provision-script`       | Returns the provisioning SQL as `text/plain`, for manual mode. It needs an all-tenant scope.                                                                                                                     |
| `GET /admin/analytics/principals`             | Lists the principals within the caller's scope.                                                                                                                                                                  |
| `POST /admin/analytics/principals`            | Takes `{ label, pii?, scope: { tenants, verticals? }, expiresAt?, connectionLimit?, createdBy? }` and returns `201` with `{ principal, password, connection, mode, script? }`.                                   |
| `POST /admin/analytics/principals/:id/rotate` | Returns a new password.                                                                                                                                                                                          |
| `DELETE /admin/analytics/principals/:id`      | Revokes the principal.                                                                                                                                                                                           |

Errors:

| Code                   | Status | When                                                               |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| `POSTGRES_REQUIRED`    | 409    | The deployment runs on SQLite.                                     |
| `MANUAL_MODE`          | 409    | Provisioning was requested without `ANALYTICS_ADMIN_DATABASE_URL`. |
| `NOT_PROVISIONED`      | 409    | A principal was requested before the views were provisioned.       |
| `DATA_STORE_DISABLED`  | 409    | The deployment runs in passthrough mode.                           |
| `SCOPE_EXCEEDS_CALLER` | 403    | The principal's scope exceeds the caller's.                        |
| `PII_NOT_ALLOWED`      | 403    | An unmasked principal was requested without `revealPii`.           |
| `SCOPE_TOO_NARROW`     | 403    | A tenant-scoped caller tried to provision.                         |
| `PRINCIPAL_NOT_FOUND`  | 404    | The principal doesn't exist or is outside the caller's scope.      |
