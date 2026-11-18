/**
 * Databricks loader (`@databricks/sql`, loaded on first use) — Delta tables
 * through a SQL warehouse.
 *
 * Per batch, for table `os_<vertical>_<type>` in `[catalog.]schema`:
 *
 *   upload   the Parquet file to the stage location (S3/GCS/ADLS, through
 *            the matching object-store sink)
 *   CREATE TABLE IF NOT EXISTS  target USING DELTA (fixed columns)
 *   ALTER TABLE … ADD COLUMNS   new flattened columns
 *   CREATE TABLE IF NOT EXISTS  staging `os_stage_<table>_<id>` (schemaless)
 *   COPY INTO staging FROM '<stage dir>' [WITH (CREDENTIAL …)]
 *            FILEFORMAT = PARQUET FILES = (…) … ('mergeSchema' = 'true')
 *   MERGE INTO target USING staging ON _pk
 *            WHEN MATCHED AND target.changed_at <= staging.changed_at → UPDATE
 *            WHEN NOT MATCHED → INSERT
 *   DROP TABLE staging
 *
 * Deletes: record tombstones are staged and copied like rows, then applied
 * with `MERGE … WHEN MATCHED THEN DELETE`; connection / vertical / all
 * tombstones are parameterised DELETEs. All guarded by
 * `changed_at <= deleted_at`.
 *
 * The warehouse must be able to read the stage location: a Unity Catalog
 * external location covering it, or `stage.credentialName`.
 */
import { randomUUID } from 'node:crypto'
import type { DeleteSpec, TableSink } from '../types'
import { PARQUET_CONTENT_TYPE, rowsToParquet, type ColumnKind } from '../writers/parquet'
import {
  createLoaderSink,
  probeRow,
  recordDeletes,
  wideDeletes,
  STAGE_DIR,
  type LoaderDriver,
} from './engine'
import type { DatabricksConfig, DatabricksSecrets } from './schemas'
import { createStage, type StageDeps, type StagedFile } from './stage'
import { assertGenerated, databricksIdent, sqlLiteral } from './sql'

export type DatabricksParam = string | number | boolean | null

/** The slice of a Databricks SQL session the loader uses; tests pass a fake. */
export interface DatabricksClientLike {
  execute(sql: string, params?: DatabricksParam[]): Promise<Array<Record<string, unknown>>>
  close(): Promise<void>
}

export interface DatabricksConnectOptions {
  host: string
  path: string
  token: string
  catalog?: string
  schema: string
}

export interface DatabricksLoaderDeps extends StageDeps {
  clientFactory?: (opts: DatabricksConnectOptions) => Promise<DatabricksClientLike>
  newId?: () => string
  now?: () => number
}

const DBX_TYPE: Record<ColumnKind, string> = {
  string: 'STRING',
  int: 'BIGINT',
  float: 'DOUBLE',
  bool: 'BOOLEAN',
}

function kindOfDatabricksType(t: string): ColumnKind {
  switch (t.toLowerCase()) {
    case 'bigint':
    case 'int':
    case 'smallint':
    case 'tinyint':
      return 'int'
    case 'double':
    case 'float':
      return 'float'
    case 'boolean':
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

async function defaultClient(opts: DatabricksConnectOptions): Promise<DatabricksClientLike> {
  type Operation = {
    fetchAll(): Promise<object[]>
    close(): Promise<unknown>
  }
  type Session = {
    executeStatement(sql: string, o?: Record<string, unknown>): Promise<Operation>
    close(): Promise<unknown>
  }
  type Client = {
    connect(o: Record<string, unknown>): Promise<unknown>
    openSession(o?: Record<string, unknown>): Promise<Session>
    close(): Promise<void>
  }
  type Sdk = { DBSQLClient: new () => Client }
  const mod = (await import('@databricks/sql')) as unknown as Sdk & { default?: Sdk }
  const DBSQLClient = mod.DBSQLClient ?? mod.default!.DBSQLClient
  const client = new DBSQLClient()
  await client.connect({ host: opts.host, path: opts.path, token: opts.token })
  let session: Session
  try {
    session = await client.openSession({
      ...(opts.catalog ? { initialCatalog: opts.catalog } : {}),
      initialSchema: opts.schema,
    })
  } catch (err) {
    await client.close().catch(() => {})
    throw err
  }
  return {
    async execute(sql, params) {
      const op = await session.executeStatement(sql, {
        ...(params && params.length > 0 ? { ordinalParameters: params } : {}),
      })
      try {
        return (await op.fetchAll()) as Array<Record<string, unknown>>
      } finally {
        await op.close().catch(() => {})
      }
    },
    async close() {
      await session.close().catch(() => {})
      await client.close()
    },
  }
}

function countOf(rows: Array<Record<string, unknown>>, key: string): number {
  const v = rows[0]?.[key]
  return typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : Number(v ?? 0) || 0
}

export async function createDatabricksLoader(
  config: DatabricksConfig,
  secrets: DatabricksSecrets,
  deps: DatabricksLoaderDeps,
): Promise<TableSink> {
  await deps.hostGuard(config.host)
  // Validate every name now: a bad one fails the build, not the first batch.
  const ns = `${config.catalog ? `${databricksIdent(config.catalog, 'catalog')}.` : ''}${databricksIdent(config.schema, 'schema')}`
  const credential = config.stage.credentialName
    ? ` WITH (CREDENTIAL ${databricksIdent(config.stage.credentialName, 'credentialName')})`
    : ''

  const stage = await createStage(config.stage, secrets, 'spark', deps)
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 16))
  const connect = deps.clientFactory ?? defaultClient
  let client: DatabricksClientLike | undefined
  const exec = async (sql: string, params?: DatabricksParam[]) =>
    (client ??= await connect({
      host: config.host,
      path: config.httpPath,
      token: secrets.token,
      catalog: config.catalog,
      schema: config.schema,
    })).execute(sql, params)

  const t = (table: string) => `${ns}.${databricksIdent(assertGenerated(table, 'table'), 'table')}`
  const c = (name: string) => databricksIdent(assertGenerated(name), 'column')

  /** A schemaless Delta staging table filled from one staged file. */
  async function stageTable(kind: string, table: string, file: StagedFile): Promise<string> {
    const staging = `os_${kind}_${table}_${newId()}`
    await exec(`CREATE TABLE IF NOT EXISTS ${t(staging)}`)
    await exec(
      `COPY INTO ${t(staging)} FROM ${sqlLiteral(file.dirUrl, 'stage url')}${credential} ` +
        `FILEFORMAT = PARQUET FILES = (${sqlLiteral(file.name, 'file name')}) ` +
        `FORMAT_OPTIONS ('mergeSchema' = 'true') ` +
        `COPY_OPTIONS ('mergeSchema' = 'true', 'force' = 'true')`,
    )
    return staging
  }

  const driver: LoaderDriver = {
    async describe(table) {
      const found = await exec(
        `SHOW TABLES IN ${ns} LIKE ${sqlLiteral(assertGenerated(table, 'table'))}`,
      )
      if (found.length === 0) return null
      const rows = await exec(`DESCRIBE TABLE ${t(table)}`)
      const cols = new Map<string, ColumnKind>()
      for (const r of rows) {
        const name = String(r['col_name'] ?? '')
        // DESCRIBE lists the columns, then `# Partition Information` etc.
        if (name === '' || name.startsWith('#')) break
        cols.set(name.toLowerCase(), kindOfDatabricksType(String(r['data_type'] ?? '')))
      }
      return cols
    },
    async createTable(table) {
      await exec(
        `CREATE TABLE IF NOT EXISTS ${t(table)} (` +
          `${c('_pk')} STRING NOT NULL, ${c('connection_id')} STRING, ${c('owner_tenant_id')} STRING, ` +
          `${c('platform')} STRING NOT NULL, ${c('vertical')} STRING NOT NULL, ` +
          `${c('resource_type')} STRING NOT NULL, ${c('resource_id')} STRING NOT NULL, ` +
          `${c('changed_at')} TIMESTAMP NOT NULL, ${c('norm_version')} STRING, ` +
          `${c('_deleted')} BOOLEAN NOT NULL, ${c('data')} STRING, ${c('_exported_at')} TIMESTAMP) ` +
          `USING DELTA`,
      )
    },
    async addColumns(table, columns) {
      if (columns.length === 0) return
      await exec(
        `ALTER TABLE ${t(table)} ADD COLUMNS (` +
          columns.map((col) => `${c(col.name)} ${DBX_TYPE[col.kind]}`).join(', ') +
          ')',
      )
    },
    async mergeRows(table, file, columns) {
      const staging = await stageTable('stage', table, file)
      try {
        const cols = [...FIXED, ...columns.map((col) => col.name)]
        const updates = cols
          .filter((n) => n !== '_pk')
          .map((n) => `t.${c(n)} = s.${c(n)}`)
          .concat(`t.${c('_exported_at')} = current_timestamp()`)
        const res = await exec(
          `MERGE INTO ${t(table)} AS t USING ${t(staging)} AS s ON t.${c('_pk')} = s.${c('_pk')} ` +
            `WHEN MATCHED AND t.${c('changed_at')} <= s.${c('changed_at')} THEN UPDATE SET ${updates.join(', ')} ` +
            `WHEN NOT MATCHED THEN INSERT (${[...cols, '_exported_at'].map(c).join(', ')}) ` +
            `VALUES (${cols.map((n) => `s.${c(n)}`).join(', ')}, current_timestamp())`,
        )
        return countOf(res, 'num_affected_rows')
      } finally {
        await exec(`DROP TABLE IF EXISTS ${t(staging)}`).catch(() => {})
      }
    },
    async applyDeletes(table, deletes, stageDeletes) {
      let n = 0
      const records = recordDeletes(deletes)
      if (records.length > 0) {
        const staging = await stageTable('del', table, await stageDeletes(records))
        try {
          const res = await exec(
            `MERGE INTO ${t(table)} AS t USING ${t(staging)} AS d ` +
              `ON t.${c('_pk')} = d.${c('_pk')} AND t.${c('changed_at')} <= d.${c('deleted_at')} ` +
              `WHEN MATCHED THEN DELETE`,
          )
          n += countOf(res, 'num_affected_rows')
        } finally {
          await exec(`DROP TABLE IF EXISTS ${t(staging)}`).catch(() => {})
        }
      }
      for (const d of wideDeletes(deletes)) n += await wideDelete(table, d)
      return n
    },
    async test(s) {
      const file = await s.upload(
        `${STAGE_DIR}/_connection_test/probe.parquet`,
        await rowsToParquet([probeRow(now())], { compression: 'snappy', columns: [] }),
        PARQUET_CONTENT_TYPE,
      )
      try {
        const staging = await stageTable('probe', 'connection_test', file)
        await exec(`DROP TABLE IF EXISTS ${t(staging)}`)
      } finally {
        await s.remove(file.path).catch(() => {})
      }
    },
    async close() {
      const cl = client
      client = undefined
      await cl?.close()
    },
  }

  async function wideDelete(table: string, d: DeleteSpec): Promise<number> {
    const res =
      d.scope === 'connection'
        ? await exec(
            `DELETE FROM ${t(table)} WHERE ${c('platform')} = ? AND ${c('connection_id')} <=> ? ` +
              `AND ${c('changed_at')} <= timestamp_millis(?)`,
            [d.platform, d.connectionId, d.deletedAt],
          )
        : await exec(`DELETE FROM ${t(table)} WHERE ${c('changed_at')} <= timestamp_millis(?)`, [
            d.deletedAt,
          ])
    return countOf(res, 'num_affected_rows')
  }

  return createLoaderSink({ stage, driver, newId })
}
