# Destinations: export synced records to your lake or warehouse

A **destination** copies the records OpenSteward has synced into its data store
to storage you own, on a schedule:

- **Parquet files** in an object store: Amazon S3 and S3-compatible stores
  (MinIO, Cloudflare R2, Backblaze B2, …), Google Cloud Storage, or Azure Blob
  Storage. Point DuckDB, Spark, Athena, BigQuery external tables, Snowflake
  stages or Databricks at the files.
- **Rows in Postgres**: one table per resource type, kept up to date with
  upserts and deletes.
- **Tables in a warehouse**: Snowflake, BigQuery or Databricks (Delta). The
  loader stages Parquet files in an object store the warehouse can read, loads
  them, and `MERGE`s them into one current-state table per resource type,
  applying deletes too. See [warehouse loaders](#warehouse-loaders).
- **Apache Iceberg (experimental)**: tables managed in an Iceberg REST
  catalog, with Iceberg-ready Parquet files you register with your engine.
  See [Iceberg](#iceberg-experimental).

Destinations work on SQLite and Postgres deployments alike. They need the data
store, so they are unavailable with `DATA_STORE_MODE=passthrough` (the API
answers `409 DATA_STORE_DISABLED`).

---

## How an export runs

The export worker runs inside integration-server. Every 30 seconds it looks for
destinations that are **due**: enabled, with their interval (`intervalSec`,
default 3600, minimum 60) elapsed since the last run. For each one it:

1. **Takes the destination's lease.** A conditional `UPDATE` means exactly one
   replica runs a given destination at a time. The lease lasts 10 minutes and
   is renewed at every file written.
2. **Exports changed rows.** For each (vertical, resource type) in the
   destination's scope, it reads rows whose data changed since that pair's
   cursor, masks them, and writes them in files of at most 50,000 rows or
   about 128 MB. **The cursor moves only after the file (or Postgres or
   warehouse batch) has been written.**
3. **Exports deletions**, from the tombstone feed, after the rows.
4. **Writes a manifest** listing every file the run wrote (object stores only).
5. **Records the run** in the destination's run history.

A row only counts as changed when its **data** changes. A full re-sync that
re-writes identical data doesn't re-export it. Rows and deletions from the last
**120 seconds** are held back until the next run, because a write stamped at
time T can commit after a reader has already moved past T.

### Delivery is at least once

If a run fails after writing a file but before saving its cursor, the next run
writes those rows again, in a new file. Consumers should **deduplicate on
`_pk`, keeping the row with the greatest `changed_at`**. The Postgres sink and
the warehouse loaders do exactly that.

A failed run leaves every cursor at the last successful write. The next run
(at the next interval, or when you trigger one) continues from there.

---

## File layout (object stores)

All paths are under the destination's `prefix`:

```
<prefix>vertical=<vertical>/resource_type=<type>/dt=<YYYY-MM-DD>/<runId>-<part>.parquet
<prefix>_deletes/dt=<YYYY-MM-DD>/<runId>-<part>.parquet
<prefix>_manifests/<runId>.json
<prefix>_opensteward/connection-test.json      (written by "test connection")
```

- The paths are Hive-style partitions, so most engines pick up `vertical`,
  `resource_type` and `dt` as columns.
- `dt` is the UTC date the run **started**, not the date the record changed.
- `<runId>` is the run's id (a UUID, also in the run history). `<part>` is a
  zero-padded counter that is unique within the run.
- Files are never overwritten or deleted. A run's files are complete once its
  manifest exists, so readers that need consistency should list manifests
  rather than data files.

The manifest looks like this:

```json
{
  "version": 1,
  "format": "parquet",
  "runId": "5b1c…",
  "destinationId": "9f0e…",
  "trigger": "schedule",
  "startedAt": "2026-09-29T12:00:00.000Z",
  "finishedAt": "2026-09-29T12:00:04.210Z",
  "includePii": false,
  "rowsWritten": 1250,
  "deletesWritten": 3,
  "files": [
    { "path": "vertical=crm/resource_type=contacts/dt=2026-09-29/5b1c…-00000.parquet",
      "kind": "rows", "vertical": "crm", "resourceType": "contacts", "rows": 1250 },
    { "path": "_deletes/dt=2026-09-29/5b1c…-00001.parquet", "kind": "deletes", "rows": 3 }
  ]
}
```

Parquet files use ZSTD compression by default. You can set `compression` to
`snappy` or `none` instead.

---

## Columns

Every row file has these fixed columns, in this order:

| Column | Type | Meaning |
|---|---|---|
| `_pk` | string | Stable row key: `vertical:platform:connection_id:resource_type:resource_id`. Deduplicate on this. |
| `connection_id` | string | The OpenSteward connection the record came from. |
| `owner_tenant_id` | string, nullable | The deployment tenant that owns the connection. |
| `platform` | string | Upstream platform slug (`hubspot`, `shopify`, …). |
| `vertical` | string | `accounting`, `crm`, `ecommerce`, … |
| `resource_type` | string | `contacts`, `invoices`, `orders`, … |
| `resource_id` | string | The platform's id for the record. |
| `changed_at` | timestamp (ms, UTC) | When the record's data last changed in the store. Use it to order versions. |
| `norm_version` | string, nullable | Which normalizer produced the record. |
| `_deleted` | boolean | Always `false` in row files. |
| `data` | string (JSON) | The whole record, **after masking**, in OpenSteward's canonical schema. |

After the fixed columns come the record's top-level **scalar** fields (strings,
numbers and booleans), flattened for convenience:

- Names are converted to `[a-z0-9_]`, with camelCase split into snake_case
  (`firstName` becomes `first_name`). A name that clashes with a fixed column
  gets a `field_` prefix (`platform` becomes `field_platform`).
- Types are inferred per file. A column is `boolean` if every value is a
  boolean, `int64` if every value is an integer, `double` if every value is a
  number, and `string` otherwise. A mix of types becomes a string.
- Nested objects and arrays are only in `data`. **`data` is authoritative.**
  The flattened columns are there so you can filter and join without parsing
  JSON.

Delete files (`_deletes/`) have these columns: `tombstone_id`, `scope`, `_pk`,
`vertical`, `platform`, `connection_id`, `owner_tenant_id`, `resource_type`,
`resource_id`, `deleted_at`, and `_deleted` (always `true`).

## Postgres tables

Each (vertical, resource type) gets its own table,
`<schema>.os_<vertical>_<resource_type>`, with names sanitised to
`[a-z0-9_]`. For example, `opensteward.os_crm_contacts` or
`opensteward.os_customer_support_tickets`. Each table has:

- the fixed columns above, with `changed_at` as `timestamptz` and `data` as
  `jsonb`;
- an `_exported_at` column;
- one column per flattened field, added as new fields appear (up to 400 per
  table). A value that doesn't fit its column's type is written as `NULL`
  there, but is still in `data`.

The worker creates the schema (default `opensteward`) and the tables if they
don't exist. The Postgres user needs `CONNECT` on the database and `CREATE` on
the schema, or on the database if the schema doesn't exist yet.

Rows are upserted on `_pk` and **only move forward**: an older version replayed
by an at-least-once retry never overwrites a newer one.

---

## Warehouse loaders

The `snowflake`, `bigquery` and `databricks` types keep one **current-state
table per (vertical, resource type)** in your warehouse, like the Postgres
sink, but load it the way warehouses prefer: in bulk, from staged files.

### How a batch is loaded

For every batch the export worker hands it (at most 50,000 rows), a loader:

1. **Dedupes** the rows on `_pk`, keeping the greatest `changed_at`. A `MERGE`
   refuses two source rows for one target row.
2. **Creates the table** if it doesn't exist, and adds a column for every new
   flattened field (up to 400 per table). A column's type is fixed by the
   first batch that sees it.
3. **Writes one Parquet file** whose columns are exactly the table's: every
   flattened column is present, and a value that doesn't fit its column's
   type is written as `NULL` (it is still in `data`).
4. **Uploads it to the stage**:
   `<stage>/_opensteward_stage/os_<vertical>_<type>/<id>-rows.parquet`.
5. **Loads it into a staging table** (Snowflake `COPY INTO` a temporary table,
   a BigQuery load job, Databricks `COPY INTO` a Delta table) and **`MERGE`s**
   the staging table into the target on `_pk`.
6. **Drops the staging table and deletes the staged file.**

The tables are named like the Postgres ones: `os_crm_contacts`,
`os_customer_support_tickets`. Snowflake folds them to upper case
(`OS_CRM_CONTACTS`, column `FIRST_NAME`), so they resolve the same way as
unquoted names and you can query them without quotes.

### MERGE semantics

```sql
MERGE INTO target t USING staging s ON t._pk = s._pk
WHEN MATCHED AND t.changed_at <= s.changed_at THEN UPDATE SET …, _exported_at = now
WHEN NOT MATCHED THEN INSERT (…)
```

- **Forward only.** A row only changes when the incoming version is at least as
  new. An older version replayed by an at-least-once retry is ignored, so a
  retried batch converges on the same table.
- **Every column is written.** A flattened field that disappeared from a record
  becomes `NULL` in its column.
- **Types.** The fixed columns match the [Columns](#columns) table. `data` is
  `VARIANT` in Snowflake, `JSON` in BigQuery and `STRING` in Databricks (use
  `data:field` or `from_json`). Flattened columns are `VARCHAR`/`STRING`,
  `NUMBER(38,0)`/`INT64`/`BIGINT`, `FLOAT`/`FLOAT64`/`DOUBLE` or `BOOLEAN`.
  `_exported_at` is when the row was last written.
- **No multi-statement transaction.** Each statement is atomic on its own, and
  each is idempotent (the `MERGE` only moves rows forward and a delete only
  removes rows no newer than its tombstone), so a failure part-way through a
  batch is repaired by the retry.

### Deletes

Loaders apply [tombstones](#deletions-tombstones) with the same rule as the
Postgres sink: delete the rows they cover **whose `changed_at` is not after
the tombstone's `deleted_at`**.

| Scope | Snowflake | BigQuery | Databricks |
|---|---|---|---|
| `record` | Staged Parquet file, `COPY INTO` a temporary table, `DELETE … USING` | `DELETE … WHERE EXISTS (SELECT … FROM UNNEST(@deletes))`, 10,000 per statement | Staged file, `COPY INTO` a staging table, `MERGE … WHEN MATCHED THEN DELETE` |
| `connection` | `DELETE … WHERE platform = ? AND EQUAL_NULL(connection_id, ?)` | `DELETE … WHERE platform = @platform AND connection_id = @connection_id` | `DELETE … WHERE platform = ? AND connection_id <=> ?` |
| `vertical`, `all` | `DELETE … WHERE changed_at <= ?` | same | same |

Wide scopes (`connection`, `vertical`, `all`) apply to every table the
destination has written in that vertical. Every value, tombstone or row, is a
**bound parameter** or travels in a staged file. None is ever spliced into SQL.

### The stage

Loaders stage files in an object store: S3, GCS or Azure Blob, whichever your
warehouse can read. The loader writes with the `stage*` credentials. The
warehouse reads with its own access: a storage integration, a Unity Catalog
external location, or the service account.

- Staged files live under `_opensteward_stage/` for a few seconds each. A
  failed batch can leave one behind, so add a lifecycle rule that expires
  `_opensteward_stage/` after a day or two. They hold export rows, masked like
  every other export.
- The upload credentials need **write and delete** on the stage prefix. Without
  delete, loads still work, but files accumulate until the lifecycle rule
  removes them.
- "Test connection" writes `_opensteward_stage/_connection_test/probe.parquet`,
  has the warehouse load it into a throwaway table, then removes both. That
  proves the upload credentials, the warehouse's read access to the stage and
  `CREATE TABLE` in the target schema in one go.

Stage URLs may be spelled `s3://bucket/prefix/`, `gcs://` or `gs://`,
`azure://<account>.blob.core.windows.net/<container>/prefix/`, or
`abfss://<container>@<account>.dfs.core.windows.net/prefix/`. Each loader
renders them the way its warehouse expects. Path segments may contain only
letters, digits, `.`, `_`, `-` and `=`.

### Snowflake

| Config | |
|---|---|
| `account` | Account identifier: `myorg-myaccount`, or a locator such as `xy12345.eu-west-1`. |
| `host` | Optional. Overrides `<account>.snowflakecomputing.com`, for PrivateLink or `.snowflakecomputing.cn`. |
| `warehouse`, `database`, `schema`, `role` | Where to load. The schema must exist. `role` defaults to the user's default role. |
| `stage` | `{ type: "s3" \| "gcs" \| "azure", url, region?, storageIntegration? }` |

Secrets: `username`, plus **either** `password` **or** `privateKey` (PEM, with
`privateKeyPassphrase` if it's encrypted). Key-pair authentication is
recommended. Also the stage credentials: `stageAccessKeyId` +
`stageSecretAccessKey` (+ `stageSessionToken`) for S3, `stageCredentialsJson`
for GCS, or `stageAccountKey`/`stageSasToken` for Azure.

**Setup.** Create a storage integration for the stage location, and a
least-privilege role for the loader:

```sql
-- As ACCOUNTADMIN (or a role with CREATE INTEGRATION).
CREATE STORAGE INTEGRATION opensteward_stage
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = 'S3'
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::123456789012:role/snowflake-opensteward'
  STORAGE_ALLOWED_LOCATIONS = ('s3://lake/stage/');
DESC INTEGRATION opensteward_stage;  -- trust-policy values for the IAM role

CREATE ROLE opensteward_loader;
GRANT USAGE ON INTEGRATION opensteward_stage TO ROLE opensteward_loader;
GRANT USAGE ON WAREHOUSE load_wh TO ROLE opensteward_loader;
GRANT USAGE ON DATABASE analytics TO ROLE opensteward_loader;
GRANT USAGE, CREATE TABLE ON SCHEMA analytics.opensteward TO ROLE opensteward_loader;

CREATE USER opensteward_loader
  DEFAULT_ROLE = opensteward_loader
  DEFAULT_WAREHOUSE = load_wh
  RSA_PUBLIC_KEY = 'MIIBIjANBgkqh…';
GRANT ROLE opensteward_loader TO USER opensteward_loader;
```

- The IAM role behind the integration needs `s3:GetObject`, `s3:GetObjectVersion`
  and `s3:ListBucket` on the stage prefix. For GCS or Azure integrations, follow
  Snowflake's instructions for granting the integration's service principal
  read access.
- The loader owns the tables it creates. If you create them yourself, grant the
  role `SELECT, INSERT, UPDATE, DELETE` on them.
- `CREATE TABLE` on the schema also covers the temporary staging tables. They
  are session-scoped, so an interrupted load never leaves one behind.
- **Without a storage integration** (S3 and Azure only), the loader passes the
  stage credentials in the `COPY` statement's `CREDENTIALS` clause, so they
  are part of statement text Snowflake receives. Prefer an integration. GCS
  always needs one.

**Costs.** Warehouse time for `COPY` and `MERGE` on every batch. Size the
warehouse small (X-Small handles tens of thousands of rows per batch) and let it
auto-suspend. A destination's `intervalSec` controls how often it wakes.

### BigQuery

| Config | |
|---|---|
| `projectId` | Project that owns the dataset and runs the jobs. |
| `dataset` | Dataset for the tables. It must exist. |
| `location` | Dataset location. Required unless it's `US` or `EU`. |
| `gcsBucket`, `gcsPrefix` | Where files are staged. The bucket must be in a location the dataset can load from. |

Secret: `serviceAccountJson`, used for BigQuery and the bucket. Leave it out to
use Application Default Credentials (workload identity, for example).

**Setup.** Grant the service account:

- `roles/bigquery.jobUser` on the project, to run load and query jobs;
- `roles/bigquery.dataEditor` on the dataset, to create tables, run DML and
  read `INFORMATION_SCHEMA.COLUMNS`;
- `roles/storage.objectUser` on the staging bucket (or a prefix-scoped IAM
  condition), to write, read and delete staged files.

Each batch loads into its own staging table, `os_stage_<table>_<id>` (Parquet,
`WRITE_TRUNCATE`), in the same dataset, then merges it and drops it. Target
tables are `CLUSTER BY _pk`.

**Costs.** Load jobs are free. The `MERGE` and `DELETE` statements are billed
as queries: on-demand pricing bills the bytes they read from the target and
staging tables, and clustering on `_pk` keeps that down. Mutating DML on one
table is serialized by BigQuery, which is fine at the export's pace. A longer
`intervalSec` means fewer, larger merges.

### Databricks

| Config | |
|---|---|
| `host` | Workspace host name without `https://`, e.g. `dbc-1234.cloud.databricks.com`. |
| `httpPath` | The SQL warehouse's HTTP path, e.g. `/sql/1.0/warehouses/abc123`. |
| `catalog`, `schema` | Where the Delta tables go. The schema must exist. Omit `catalog` for the workspace default. |
| `stage` | `{ type, url, region?, credentialName? }`. `credentialName` is a Unity Catalog storage credential used as `COPY INTO … WITH (CREDENTIAL …)`. |

Secrets: `token` (a personal access token or a service principal's token), plus
the `stage*` upload credentials.

**Setup** (Unity Catalog, as a metastore or catalog admin):

```sql
GRANT USE CATALOG ON CATALOG main TO `opensteward-loader`;
GRANT USE SCHEMA, CREATE TABLE ON SCHEMA main.opensteward TO `opensteward-loader`;
-- Let the warehouse read the stage:
GRANT READ FILES ON EXTERNAL LOCATION opensteward_stage TO `opensteward-loader`;
```

- Grant `CAN USE` on the SQL warehouse, too.
- Either an external location covers the stage URL (above), or set
  `stage.credentialName` to a storage credential the principal may use.
- The loader owns the tables it creates. If you create them yourself, grant
  `SELECT` and `MODIFY` on them.
- Each batch creates a schemaless staging table, `os_stage_<table>_<id>`, fills
  it with `COPY INTO … FILEFORMAT = PARQUET` (`mergeSchema`), merges it and
  drops it. An interrupted batch can leave one behind, and it's safe to drop.

**Costs.** SQL warehouse time while batches run. A serverless warehouse with a
short auto-stop suits the export's bursty pattern.

---

## Iceberg (experimental)

The `iceberg` type is **experimental**. The catalog lists it with
`experimental: true`, and its layout may still change.

**What it does**, using only the JSON parts of the
[Iceberg REST catalog spec](https://iceberg.apache.org/spec/#iceberg-rest-catalog):

- reads the catalog's path prefix from `GET /v1/config?warehouse=…`;
- creates the namespace if it's missing;
- creates one table per (vertical, resource type), `os_<vertical>_<type>`,
  with format version 2, a schema derived from the export columns, and a
  `schema.name-mapping.default` property so Parquet files without Iceberg field
  ids map onto the schema by column name;
- evolves that schema as new flattened fields appear (`add-schema` +
  `set-current-schema`, guarded by `assert-current-schema-id`; it retries on a
  concurrent change);
- writes each batch's rows as an Iceberg-ready Parquet file, typed to the
  table's schema, with `changed_at` as a microsecond `timestamptz`.

**What it does not do: commit data snapshots.** An append commit needs Avro
manifest and manifest-list files, and a partial implementation could corrupt
your table. Rather than risk that, OpenSteward leaves the commit to your
engine, and every batch is recorded as pending:

```
<storage>/<namespace…>/<table>/data/batch_<id>/00000.parquet     rows
<storage>/<namespace…>/<table>/_deletes/batch_<id>.parquet       tombstones (same columns as _deletes/ above)
<storage>/<namespace…>/<table>/_opensteward/pending/<id>.json    what to register
```

A pending manifest looks like this:

```json
{
  "version": 1, "format": "iceberg-ready", "experimental": true, "kind": "rows",
  "table": { "namespace": ["lake", "opensteward"], "name": "os_crm_contacts",
             "location": "s3://lake/iceberg/lake/opensteward/os_crm_contacts" },
  "schemaId": 2,
  "directory": "s3://lake/iceberg/lake/opensteward/os_crm_contacts/data/batch_5b1c…/",
  "files": [{ "path": "…/00000.parquet", "format": "PARQUET", "recordCount": 1250, "fileSizeInBytes": 88213 }],
  "columns": [{ "name": "email", "type": "string" }],
  "createdAt": "2026-09-29T12:00:04.210Z"
}
```

**Registering the files.** Each batch has its own directory, so it can be
added exactly once. With Spark:

```sql
CALL lake.system.add_files(
  table => 'lake.opensteward.os_crm_contacts',
  source_table => '`parquet`.`s3://lake/iceberg/lake/opensteward/os_crm_contacts/data/batch_5b1c…/`'
);
```

Then delete, or move, the pending manifest. Once the files are committed,
anything that reads the catalog can query the table: Spark, Trino, Flink,
Snowflake through a catalog integration, and so on. Before that, you can read
the files directly, for example with DuckDB's
`read_parquet('s3://…/data/*/*.parquet')`.

**The table is an append log**, not current state:

- Deduplicate on `_pk`, keeping the greatest `changed_at`.
- Apply `_deletes/` with the usual rule (delete rows whose `changed_at` is not
  after `deleted_at`).
- A periodic `MERGE` into a compacted table works well for this.

Erasure in Iceberg tables is your responsibility, as with Parquet files.

| Config | |
|---|---|
| `catalogUri` | REST catalog base URL: the part before `/v1/…`, such as `https://polaris.example.com/api/catalog`. |
| `warehouse` | Passed to `GET /v1/config?warehouse=`. The catalog decides what it means (a name or a location). |
| `namespace` | Dot-separated, default `opensteward`. Created if missing. |
| `storage` | `{ type, url, region?, endpoint?, forcePathStyle? }`, where the files and the table locations go. The catalog must allow table locations under it. |

Secrets: `token`, a bearer token for the catalog, plus the `stage*` upload
credentials for `storage`.

**Limits.**

- Authentication is a static bearer token. OAuth2 client credentials,
  SigV4 (the AWS Glue REST endpoint) and credential vending aren't supported.
- The table location is set to
  `<storage url>/<namespace path>/<table>`. Catalogs that assign locations
  themselves may refuse it.
- Tested against the REST spec's request and response shapes, not against every
  catalog implementation. Treat it as a preview.

---

## Deletions (tombstones)

When a record leaves the data store, OpenSteward records a tombstone, and the
next export forwards it. A record leaves the store when it is deleted through
the API, when a full sync finds it gone upstream, when its connection is
deleted, or when an operator clears the cache. A tombstone has one of four
scopes:

| `scope` | Set columns | Means |
|---|---|---|
| `record` | all, including `_pk` | One record was deleted. |
| `connection` | `vertical`, `platform`, `connection_id` | Every record of that connection on that platform. |
| `vertical` | `vertical` | Every record in the vertical (an operator cleared it). |
| `all` | none | Every record. |

To apply a tombstone, delete the rows it covers **whose `changed_at` is not
after its `deleted_at`**. A record that was deleted and later re-created keeps
its newer version. The Postgres sink and the warehouse loaders apply deletes this
way, and apply wider scopes to every table the destination has written (see
[warehouse deletes](#deletes)). Iceberg logs them to `_deletes/`.

A new destination starts reading the delete feed from the moment it is created.
Older deletions removed records it could never have exported.

---

## Scope and tenants

A destination's `scope` decides what it exports:

```json
{
  "tenants": ["tenant-a"],
  "verticals": { "crm": "*", "ecommerce": ["orders"] },
  "maskFinancial": false
}
```

- `tenants`: the deployment tenants whose connections are exported (matched on
  the connection's owner tenant), or `"*"` for every tenant. Only a `"*"`
  destination exports connections that have no owner tenant.
- `verticals`: which verticals, and within each which resource types (`"*"`
  means all of them). Leave it out to export everything.
- `maskFinancial`: also mask financial fields (amounts, balances).

Through admin-api, a user can only create or edit a destination whose scope
fits inside their own access. The same applies to their tenants, verticals and
financial masking. A destination outside a user's access is invisible to them.

Widening a destination's scope doesn't re-export rows that were skipped before.
Run a **backfill** after widening it.

---

## PII

Records are **masked by default**, using the same field classification the
admin data viewer uses (see [data classification](../security/data-classification.md)):

- PII fields (names, emails, phone numbers, addresses, the raw upstream
  `metadata`) are masked.
- Secrets are always removed.
- Financial fields are masked only with `maskFinancial`.

`includePii: true` exports PII unmasked. Only a user holding
`data:read_pii` can turn it on, and they are recorded as its approver
(`piiApprovedBy`). Changes that could redirect an approved PII export also need
that permission: its config, scope or credentials. Turning PII or the
destination off doesn't.

### Erasure

Parquet files in your bucket are **immutable**. OpenSteward never rewrites or
deletes them. When a data-subject erasure removes records from OpenSteward, the
tombstones go to `_deletes/`, but **erasing the data from files already
exported is your responsibility**. For example, compact or rewrite partitions
with your lake's tooling, or apply lifecycle rules. The same goes for Iceberg
tables. Postgres, Snowflake, BigQuery and Databricks destinations do apply the
deletes (warehouse time travel and fail-safe keep old versions for a while, per
your warehouse's retention settings). See also
[data erasure](../operations/data-erasure.md).

---

## Configuration per type

Secrets are **write-only**. The API stores them encrypted and returns only
`secretFieldsSet`, the names of the fields that hold a value.

| Type | Config | Secrets |
|---|---|---|
| `s3` | `bucket`, `region` (default `us-east-1`), `prefix`, `endpoint` (MinIO/R2/…), `forcePathStyle` (MinIO: `true`), `compression` | `accessKeyId` + `secretAccessKey` (+ `sessionToken`). Omit both to use the default AWS credential chain (instance role, IRSA, env). |
| `gcs` | `bucket`, `prefix`, `projectId`, `apiEndpoint`, `compression` | `credentialsJson` (a service-account key). Omit it to use Application Default Credentials. |
| `azure_blob` | `accountName`, `container`, `prefix`, `endpoint` (Azurite), `compression` | `accountKey` **or** `sasToken` (container SAS with create + write) |
| `postgres` | `host`, `port` (5432), `database`, `user`, `schema` (`opensteward`), `ssl` (`disable` / `require` / `verify-full`, default `require`) | `password` |
| `snowflake` | `account`, `host`, `warehouse`, `database`, `schema`, `role`, `stage` ([details](#snowflake)) | `username` + `password` **or** `privateKey` (+ `privateKeyPassphrase`), `stage*` |
| `bigquery` | `projectId`, `dataset`, `location`, `gcsBucket`, `gcsPrefix` ([details](#bigquery)) | `serviceAccountJson` (or Application Default Credentials) |
| `databricks` | `host`, `httpPath`, `catalog`, `schema`, `stage` ([details](#databricks)) | `token`, `stage*` |
| `iceberg` *(experimental)* | `catalogUri`, `warehouse`, `namespace`, `storage` ([details](#iceberg-experimental)) | `token`, `stage*` |

`stage*` are the credentials a loader uploads staged files with:
`stageAccessKeyId` + `stageSecretAccessKey` (+ `stageSessionToken`) for S3
(omit both for the default AWS chain), `stageCredentialsJson` for GCS (omit for
Application Default Credentials), and `stageAccountKey` or `stageSasToken` for
Azure.

Every name that reaches warehouse SQL (databases, schemas, datasets, catalogs,
roles, storage integrations and credentials) must match a strict pattern
(letters, digits and `_`, plus `$` in Snowflake names and `-` in BigQuery
project ids). It is quoted even then.

`GET /admin/destinations/types` returns every type's config and secret fields
as JSON Schema, with descriptions and defaults.

### Private hosts (SSRF guard)

The worker connects to whatever host a destination names, from inside your
network. Every host a destination names must resolve to **public** addresses:
a custom S3 endpoint, a GCS or Azure endpoint, a Postgres host, a Snowflake
account host (`<account>.snowflakecomputing.com` or `host`), a Databricks
workspace host, or an Iceberg catalog URL. The check runs when the destination
is saved and again before every run. BigQuery and the cloud storage endpoints
the SDKs build themselves aren't operator-controlled and aren't checked.
Snowflake PrivateLink hosts resolve to private addresses, so list them here.

To point a destination at a private host on purpose, such as MinIO next to the
stack or a Postgres on your LAN, list that host name:

```bash
DESTINATIONS_ALLOW_PRIVATE_HOSTS=minio,warehouse.internal
```

### Environment

| Variable | Default | Effect |
|---|---|---|
| `DESTINATIONS_WORKER` | on | `off` stops the scheduler. Manual runs through the API still work. |
| `DESTINATIONS_WORKER_INTERVAL_MS` | `30000` | How often the scheduler looks for due destinations. |
| `DESTINATIONS_ALLOW_PRIVATE_HOSTS` | *(none)* | Host names exempt from the SSRF guard. |

Destination credentials are encrypted with `STORE_SECRET` in the data-store
database (`resources.db` on SQLite). When you rotate the secret, pass that file
to `pnpm rotate-store-secret` too (see [persistence](../architecture/persistence.md#the-destinations-namespace-exports)).

---

## From the console

Operators with the `destinations:manage` permission (admins by default) find
**Destinations** in the admin console's Admin group:

- **List** (`/destinations`): each destination in your tenant scope with its
  type, scope, schedule and the status, time and error of its last run.
- **New destination** (`/destinations/new`): pick a type, then fill in a form
  generated from the type catalog. Nested settings, such as a loader's
  `stage`, get their own fieldset. Credential fields are password inputs that
  are never filled back in. Types marked experimental (Iceberg) carry a badge.
  The tenant and vertical picker offers only what you may grant: a
  tenant-restricted operator sees only their own tenants and can't pick "every
  tenant". **Export personal data unmasked** appears only if you hold
  `data:read_pii`.
- **Detail** (`/destinations/:id`): the settings, the names of the credential
  fields that are set, and the run history with the files each run wrote.
  From here you can **Test connection**, **Run now**, change the schedule,
  **Backfill** (all, one vertical, or one resource type), replace the
  credentials, or delete the destination. Backfill, credential replacement
  and delete ask for confirmation first.

The console calls admin-api's `/api/destinations/*` routes, which mirror the
ones below and need the same permission. admin-api sends your scope and, only
if you hold `data:read_pii`, the right to approve a PII export. It audits every
change as `destination.create`, `destination.update`, `destination.delete`,
`destination.run`, `destination.backfill`, `destination.credentials_rotate` or
`destination.test`, and credential values never appear in the audit log.

---

## API (integration-server, internal)

admin-api proxies these routes. Every route needs `X-Admin-Secret` and, except
`/types`, the caller's `X-OpenSteward-Data-Scope`. Write bodies carry `actor`,
the admin user id, which is recorded as `createdBy` and `piiApprovedBy`.

| Route | Does |
|---|---|
| `GET /admin/destinations/types` | Type catalog with config and secret JSON Schemas. |
| `GET /admin/destinations` | Destinations visible to the caller. |
| `POST /admin/destinations` | Create: `{ name, type, config, secrets?, scope, includePii?, intervalSec?, enabled?, actor }`. Returns `201`. |
| `GET` / `PATCH` / `DELETE /admin/destinations/:id` | Read, patch (`name`, `config`, `scope`, `includePii`, `intervalSec`, `enabled`), or delete. |
| `PUT /admin/destinations/:id/credentials` | Replace (rotate) the secrets: `{ secrets, actor }`. |
| `POST /admin/destinations/:id/test` | Build the sink and write the probe object, check Postgres `CREATE`, or round-trip a probe file through a loader's stage and warehouse. Returns `{ ok, error?, latencyMs }`. |
| `POST /admin/destinations/:id/run` | Start a run now. Returns `202 { runId }`, or `409 RUN_IN_PROGRESS` or `409 DESTINATION_DISABLED`. |
| `POST /admin/destinations/:id/backfill` | Reset cursors (all, or `{ vertical, resourceType? }`), then start a run unless `run: false`. |
| `GET /admin/destinations/:id/runs?limit=` | Run history, newest first. |

Errors use `{ error: { code, message, details? } }`:

- `400`: `INVALID_BODY`, `INVALID_CONFIG`, `UNSUPPORTED_TYPE` (a type the
  catalog doesn't list) or `HOST_NOT_ALLOWED`.
- `403`: `SCOPE_EXCEEDS_CALLER` or `PII_NOT_PERMITTED`.
- `404`: `DESTINATION_NOT_FOUND`. This is also the answer for a destination
  outside the caller's scope.
- `409`: `DATA_STORE_DISABLED`, `RUN_IN_PROGRESS` or `DESTINATION_DISABLED`.

## Try it with MinIO and DuckDB

```bash
docker run -d --name minio -p 9000:9000 minio/minio server /data
# DESTINATIONS_ALLOW_PRIVATE_HOSTS=localhost for integration-server, then create:
#   type s3, config { bucket: "lake", endpoint: "http://localhost:9000",
#   forcePathStyle: true }, secrets { accessKeyId: "minioadmin",
#   secretAccessKey: "minioadmin" }
duckdb -c "
  INSTALL httpfs; LOAD httpfs;
  SET s3_endpoint='localhost:9000'; SET s3_use_ssl=false; SET s3_url_style='path';
  SET s3_access_key_id='minioadmin'; SET s3_secret_access_key='minioadmin';
  SELECT resource_type, count(*) FROM read_parquet('s3://lake/**/*.parquet', hive_partitioning=1)
  WHERE vertical IS NOT NULL GROUP BY 1;"
```
