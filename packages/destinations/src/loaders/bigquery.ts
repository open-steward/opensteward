/**
 * BigQuery loader (`@google-cloud/bigquery`, loaded on first use).
 *
 * Per batch, for table `os_<vertical>_<type>` in the configured dataset:
 *
 *   upload   the Parquet file to `gs://<gcsBucket>/<gcsPrefix>_opensteward_stage/…`
 *            (through the GCS sink, with the same service account)
 *   CREATE TABLE IF NOT EXISTS  target (fixed columns, `data` JSON,
 *            clustered on `_pk`)
 *   ALTER TABLE … ADD COLUMN IF NOT EXISTS   new flattened columns
 *   load job  sourceFormat PARQUET, WRITE_TRUNCATE into a per-batch staging
 *            table `os_stage_<table>_<id>`
 *   MERGE    target USING staging ON _pk
 *            WHEN MATCHED AND target.changed_at <= staging.changed_at → UPDATE
 *            WHEN NOT MATCHED → INSERT
 *   DROP TABLE staging
 *
 * Deletes are DML with query parameters: record tombstones as an array of
 * (pk, deleted_at) structs, connection / vertical / all tombstones as
 * guarded DELETEs.
 *
 * Load jobs are free; the MERGE and DELETE statements are billed as queries
 * (bytes scanned of the target, which clustering on `_pk` keeps down).
 */
import { randomUUID } from 'node:crypto'
import type { DeleteSpec, TableSink } from '../types'
import { PARQUET_CONTENT_TYPE, rowsToParquet, type ColumnKind } from '../writers/parquet'
import { createGcsSink } from '../sinks/gcs'
import {
  createLoaderSink,
  probeRow,
  recordDeletes,
  wideDeletes,
  STAGE_DIR,
  type LoaderDriver,
} from './engine'
import type { BigQueryConfig, BigQuerySecrets } from './schemas'
import { createStage, type StageDeps } from './stage'
import { assertGenerated, bigqueryIdent } from './sql'

/** Parameter type descriptors, as the Node client takes them. */
export type BigQueryParamType =
  string | BigQueryParamType[] | { [field: string]: BigQueryParamType }

export interface BigQueryQueryOptions {
  params?: Record<string, unknown>
  types?: Record<string, BigQueryParamType>
  /** Fetch result rows (SELECTs). DML only needs the affected-row count. */
  rows?: boolean
}

/** The slice of the BigQuery client the loader uses; tests pass a fake. */
export interface BigQueryClientLike {
  query(
    sql: string,
    opts?: BigQueryQueryOptions,
  ): Promise<{ rows: Array<Record<string, unknown>>; affectedRows: number }>
  /** Run a load job: Parquet at `sourceUri` → `tableId` (in the dataset), WRITE_TRUNCATE. */
  loadParquet(sourceUri: string, tableId: string): Promise<void>
  close?(): Promise<void>
}

export interface BigQueryClientOptions {
  projectId: string
  dataset: string
  location?: string
  credentials?: Record<string, unknown>
}

export interface BigQueryLoaderDeps extends StageDeps {
  clientFactory?: (opts: BigQueryClientOptions) => Promise<BigQueryClientLike>
  newId?: () => string
  now?: () => number
}

const BQ_TYPE: Record<ColumnKind, string> = {
  string: 'STRING',
  int: 'INT64',
  float: 'FLOAT64',
  bool: 'BOOL',
}

function kindOfBigQueryType(t: string): ColumnKind {
  switch (t.toUpperCase()) {
    case 'INT64':
    case 'INTEGER':
      return 'int'
    case 'FLOAT64':
    case 'FLOAT':
      return 'float'
    case 'BOOL':
    case 'BOOLEAN':
      return 'bool'
    default:
      return 'string'
  }
}

const FIXED: string[] = [
  '_pk',
  'connection_id',
  'owner_tenant_id',
  'platform',
  'vertical',
  'resource_type',
  'resource_id',
  'changed_at',
  'norm_version',
  '_deleted',
  'data',
]

/** Record deletes per DELETE statement (query parameters count toward a 10 MB request). */
const DELETE_CHUNK = 10_000

async function defaultClient(opts: BigQueryClientOptions): Promise<BigQueryClientLike> {
  type Job = {
    promise(): Promise<[Record<string, unknown>]>
    getQueryResults(o?: Record<string, unknown>): Promise<[Array<Record<string, unknown>>]>
  }
  type Client = {
    createQueryJob(o: Record<string, unknown>): Promise<[Job]>
    createJob(o: Record<string, unknown>): Promise<[Job]>
  }
  type Sdk = { BigQuery: new (o: Record<string, unknown>) => Client }
  const mod = (await import('@google-cloud/bigquery')) as unknown as Sdk & { default?: Sdk }
  const BigQuery = mod.BigQuery ?? mod.default!.BigQuery
  const bq = new BigQuery({
    projectId: opts.projectId,
    ...(opts.location ? { location: opts.location } : {}),
    ...(opts.credentials ? { credentials: opts.credentials } : {}),
  })
  const location = opts.location ? { location: opts.location } : {}
  return {
    async query(sql, o = {}) {
      const [job] = await bq.createQueryJob({
        query: sql,
        useLegacySql: false,
        ...location,
        ...(o.params ? { params: o.params } : {}),
        ...(o.types ? { types: o.types } : {}),
      })
      const [meta] = await job.promise()
      const stats = (meta['statistics'] as { query?: { numDmlAffectedRows?: string } } | undefined)
        ?.query
      const rows = o.rows ? (await job.getQueryResults({ autoPaginate: true }))[0] : []
      return { rows, affectedRows: Number(stats?.numDmlAffectedRows ?? 0) }
    },
    async loadParquet(sourceUri, tableId) {
      const [job] = await bq.createJob({
        ...location,
        configuration: {
          load: {
            sourceUris: [sourceUri],
            sourceFormat: 'PARQUET',
            destinationTable: { projectId: opts.projectId, datasetId: opts.dataset, tableId },
            writeDisposition: 'WRITE_TRUNCATE',
            createDisposition: 'CREATE_IF_NEEDED',
          },
        },
      })
      // Resolves when the job is DONE; rejects with its errorResult.
      await job.promise()
    },
  }
}

export async function createBigQueryLoader(
  config: BigQueryConfig,
  secrets: BigQuerySecrets,
  deps: BigQueryLoaderDeps,
): Promise<TableSink> {
  const project = bigqueryIdent(config.projectId, 'project')
  const dataset = bigqueryIdent(config.dataset, 'dataset')
  const credentials = secrets.serviceAccountJson
    ? (JSON.parse(secrets.serviceAccountJson) as Record<string, unknown>)
    : undefined

  const sink =
    deps.sink ??
    (await createGcsSink(
      {
        bucket: config.gcsBucket,
        prefix: config.gcsPrefix,
        projectId: config.projectId,
        compression: 'snappy',
      },
      { credentialsJson: secrets.serviceAccountJson },
      { hostGuard: deps.hostGuard },
    ))
  const stage = await createStage(
    { type: 'gcs', url: `gs://${config.gcsBucket}/${config.gcsPrefix}` },
    {},
    'bigquery',
    { ...deps, sink },
  )
  const now = deps.now ?? Date.now
  const connect = deps.clientFactory ?? defaultClient
  let client: BigQueryClientLike | undefined
  const bq = async () =>
    (client ??= await connect({
      projectId: config.projectId,
      dataset: config.dataset,
      location: config.location,
      credentials,
    }))
  const run = async (sql: string, o?: BigQueryQueryOptions) => (await bq()).query(sql, o)

  const t = (table: string) => `${project}.${dataset}.${bigqueryIdent(table, 'table')}`
  const c = (name: string) => bigqueryIdent(assertGenerated(name), 'column')
  const stagingId = (table: string, kind: string) =>
    assertGenerated(`os_${kind}_${table}_${(deps.newId ?? randomId)()}`, 'table')

  const driver: LoaderDriver = {
    async describe(table) {
      const { rows } = await run(
        `SELECT column_name, data_type FROM ${project}.${dataset}.INFORMATION_SCHEMA.COLUMNS ` +
          `WHERE table_name = @table`,
        { params: { table }, types: { table: 'STRING' }, rows: true },
      )
      if (rows.length === 0) return null
      const cols = new Map<string, ColumnKind>()
      for (const r of rows) {
        cols.set(String(r['column_name']).toLowerCase(), kindOfBigQueryType(String(r['data_type'])))
      }
      return cols
    },
    async createTable(table) {
      await run(
        `CREATE TABLE IF NOT EXISTS ${t(table)} (` +
          `${c('_pk')} STRING NOT NULL, ${c('connection_id')} STRING, ${c('owner_tenant_id')} STRING, ` +
          `${c('platform')} STRING NOT NULL, ${c('vertical')} STRING NOT NULL, ` +
          `${c('resource_type')} STRING NOT NULL, ${c('resource_id')} STRING NOT NULL, ` +
          `${c('changed_at')} TIMESTAMP NOT NULL, ${c('norm_version')} STRING, ` +
          `${c('_deleted')} BOOL NOT NULL, ${c('data')} JSON, ${c('_exported_at')} TIMESTAMP) ` +
          `CLUSTER BY ${c('_pk')}`,
      )
    },
    async addColumns(table, columns) {
      if (columns.length === 0) return
      await run(
        `ALTER TABLE ${t(table)} ` +
          columns
            .map((col) => `ADD COLUMN IF NOT EXISTS ${c(col.name)} ${BQ_TYPE[col.kind]}`)
            .join(', '),
      )
    },
    async mergeRows(table, file, columns) {
      const staging = stagingId(table, 'stage')
      await (await bq()).loadParquet(file.url, staging)
      try {
        const cols = [...FIXED, ...columns.map((col) => col.name)]
        const value = (n: string) =>
          n === 'data' ? `PARSE_JSON(s.${c(n)}, wide_number_mode => 'round')` : `s.${c(n)}`
        const updates = cols
          .filter((n) => n !== '_pk')
          .map((n) => `${c(n)} = ${value(n)}`)
          .concat(`${c('_exported_at')} = CURRENT_TIMESTAMP()`)
        const { affectedRows } = await run(
          `MERGE ${t(table)} AS t USING ${t(staging)} AS s ON t.${c('_pk')} = s.${c('_pk')} ` +
            `WHEN MATCHED AND t.${c('changed_at')} <= s.${c('changed_at')} THEN UPDATE SET ${updates.join(', ')} ` +
            `WHEN NOT MATCHED THEN INSERT (${[...cols, '_exported_at'].map(c).join(', ')}) ` +
            `VALUES (${cols.map(value).join(', ')}, CURRENT_TIMESTAMP())`,
        )
        return affectedRows
      } finally {
        await run(`DROP TABLE IF EXISTS ${t(staging)}`).catch(() => {})
      }
    },
    async applyDeletes(table, deletes) {
      let n = 0
      const records = recordDeletes(deletes)
      for (let i = 0; i < records.length; i += DELETE_CHUNK) {
        const slice = records.slice(i, i + DELETE_CHUNK)
        const { affectedRows } = await run(
          `DELETE FROM ${t(table)} AS t WHERE EXISTS (` +
            `SELECT 1 FROM UNNEST(@deletes) AS d ` +
            `WHERE d.pk = t.${c('_pk')} AND t.${c('changed_at')} <= TIMESTAMP_MILLIS(d.at))`,
          {
            params: { deletes: slice.map((d) => ({ pk: d.pk, at: d.deletedAt })) },
            types: { deletes: [{ pk: 'STRING', at: 'INT64' }] },
          },
        )
        n += affectedRows
      }
      for (const d of wideDeletes(deletes)) n += await wideDelete(table, d)
      return n
    },
    async test(s) {
      const probe = stagingId('connection_test', 'probe')
      const file = await s.upload(
        `${STAGE_DIR}/_connection_test/probe.parquet`,
        await rowsToParquet([probeRow(now())], { compression: 'snappy', columns: [] }),
        PARQUET_CONTENT_TYPE,
      )
      try {
        await (await bq()).loadParquet(file.url, probe)
        await run(`DROP TABLE IF EXISTS ${t(probe)}`)
      } finally {
        await s.remove(file.path).catch(() => {})
      }
    },
    async close() {
      const cl = client
      client = undefined
      await cl?.close?.()
    },
  }

  async function wideDelete(table: string, d: DeleteSpec): Promise<number> {
    const { affectedRows } =
      d.scope === 'connection'
        ? await run(
            `DELETE FROM ${t(table)} WHERE ${c('platform')} = @platform ` +
              `AND ((${c('connection_id')} IS NULL AND @connection_id IS NULL) OR ${c('connection_id')} = @connection_id) ` +
              `AND ${c('changed_at')} <= TIMESTAMP_MILLIS(@deleted_at)`,
            {
              params: {
                platform: d.platform,
                connection_id: d.connectionId,
                deleted_at: d.deletedAt,
              },
              types: { platform: 'STRING', connection_id: 'STRING', deleted_at: 'INT64' },
            },
          )
        : await run(
            `DELETE FROM ${t(table)} WHERE ${c('changed_at')} <= TIMESTAMP_MILLIS(@deleted_at)`,
            {
              params: { deleted_at: d.deletedAt },
              types: { deleted_at: 'INT64' },
            },
          )
    return affectedRows
  }

  return createLoaderSink({ stage, driver, newId: deps.newId })
}

function randomId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}
