/**
 * Snowflake loader (`snowflake-sdk`, loaded on first use).
 *
 * Per batch, for table `OS_<VERTICAL>_<TYPE>` in the configured schema:
 *
 *   PUT     the Parquet file to the external stage location (S3/GCS/Azure,
 *           through the matching object-store sink)
 *   CREATE TABLE IF NOT EXISTS  target (fixed columns, `DATA` VARIANT)
 *   ALTER TABLE … ADD COLUMN IF NOT EXISTS   new flattened columns
 *   CREATE OR REPLACE TEMPORARY TABLE        staging (session-scoped: it
 *                                            never outlives the load)
 *   COPY INTO staging FROM '<stage url>' FILES = (…)
 *           FILE_FORMAT = (TYPE = PARQUET USE_LOGICAL_TYPE = TRUE)
 *           MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
 *   MERGE INTO target USING staging ON _PK
 *           WHEN MATCHED AND target.CHANGED_AT <= staging.CHANGED_AT → UPDATE
 *           WHEN NOT MATCHED → INSERT
 *
 * Deletes: record tombstones are staged as a Parquet file, copied into a
 * temporary table and applied with `DELETE … USING`; connection / vertical /
 * all tombstones are parameterised DELETEs. All guarded by
 * `CHANGED_AT <= deleted_at`.
 *
 * The stage is read with the storage integration when one is configured;
 * otherwise (S3, Azure) the stage credentials are passed in the COPY
 * statement's CREDENTIALS clause.
 *
 * Names are upper-cased and quoted (`"OS_CRM_CONTACTS"."FIRST_NAME"`), which
 * is exactly how the same names resolve unquoted — so they query naturally.
 */
import { DestinationConfigError, type DeleteSpec, type TableSink } from '../types'
import { PARQUET_CONTENT_TYPE, rowsToParquet, type ColumnKind } from '../writers/parquet'
import {
  createLoaderSink,
  probeRow,
  recordDeletes,
  wideDeletes,
  STAGE_DIR,
  type LoaderDriver,
} from './engine'
import type { SnowflakeConfig, SnowflakeSecrets } from './schemas'
import { createStage, hasInlineStageCredentials, type StageDeps, type StagedFile } from './stage'
import { assertGenerated, snowflakeIdent, sqlLiteral } from './sql'

export type SnowflakeBind = string | number | boolean | null

/** The slice of a Snowflake connection the loader uses; tests pass a fake. */
export interface SnowflakeClientLike {
  execute(sqlText: string, binds?: SnowflakeBind[]): Promise<Array<Record<string, unknown>>>
  close(): Promise<void>
}

export interface SnowflakeConnectOptions {
  account: string
  accessUrl: string
  username: string
  password?: string
  authenticator?: 'SNOWFLAKE_JWT'
  privateKey?: string
  privateKeyPass?: string
  warehouse: string
  database: string
  schema: string
  role?: string
}

export interface SnowflakeLoaderDeps extends StageDeps {
  clientFactory?: (opts: SnowflakeConnectOptions) => Promise<SnowflakeClientLike>
  newId?: () => string
  now?: () => number
}

/** The host a Snowflake account is dialled at — what the host guard checks. */
export function snowflakeHost(config: { account: string; host?: string }): string {
  return (
    config.host ?? `${config.account.toLowerCase().replace(/_/g, '-')}.snowflakecomputing.com`
  ).toLowerCase()
}

const SF_TYPE: Record<ColumnKind, string> = {
  string: 'VARCHAR',
  int: 'NUMBER(38,0)',
  float: 'FLOAT',
  bool: 'BOOLEAN',
}

function kindOfSnowflakeType(t: string): ColumnKind {
  const u = t.toUpperCase()
  if (u === 'BOOLEAN') return 'bool'
  if (u === 'FLOAT' || u === 'REAL' || u === 'DOUBLE' || u.startsWith('FLOAT')) return 'float'
  if (u === 'NUMBER' || u === 'FIXED' || u.startsWith('NUMBER') || u === 'INTEGER') return 'int'
  return 'string'
}

/** Fixed columns of the staging table (as they are in the Parquet file). */
const STAGE_FIXED: Array<[string, string]> = [
  ['_pk', 'VARCHAR'],
  ['connection_id', 'VARCHAR'],
  ['owner_tenant_id', 'VARCHAR'],
  ['platform', 'VARCHAR'],
  ['vertical', 'VARCHAR'],
  ['resource_type', 'VARCHAR'],
  ['resource_id', 'VARCHAR'],
  ['changed_at', 'TIMESTAMP_TZ'],
  ['norm_version', 'VARCHAR'],
  ['_deleted', 'BOOLEAN'],
  ['data', 'VARCHAR'],
]

const DELETE_STAGE: Array<[string, string]> = [
  ['tombstone_id', 'NUMBER(38,0)'],
  ['scope', 'VARCHAR'],
  ['_pk', 'VARCHAR'],
  ['vertical', 'VARCHAR'],
  ['platform', 'VARCHAR'],
  ['connection_id', 'VARCHAR'],
  ['owner_tenant_id', 'VARCHAR'],
  ['resource_type', 'VARCHAR'],
  ['resource_id', 'VARCHAR'],
  ['deleted_at', 'TIMESTAMP_TZ'],
  ['_deleted', 'BOOLEAN'],
]

const q = (name: string) => snowflakeIdent(assertGenerated(name), 'column')

function columnList(cols: Array<[string, string]>): string {
  return cols.map(([n, t]) => `${q(n)} ${t}`).join(', ')
}

function countOf(rows: Array<Record<string, unknown>>, ...keys: string[]): number {
  let n = 0
  for (const k of keys) {
    const v = rows[0]?.[k]
    n += typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : 0
  }
  return n
}

async function defaultClient(opts: SnowflakeConnectOptions): Promise<SnowflakeClientLike> {
  type Conn = {
    connect(cb: (err: Error | undefined) => void): void
    execute(o: {
      sqlText: string
      binds?: SnowflakeBind[]
      complete: (err: Error | undefined, stmt: unknown, rows?: unknown[]) => void
    }): unknown
    destroy(cb: (err: Error | undefined) => void): void
  }
  type Sdk = {
    createConnection(o: Record<string, unknown>): Conn
    configure(o: Record<string, unknown>): void
  }
  const mod = (await import('snowflake-sdk')) as unknown as Sdk & { default?: Sdk }
  const sdk = typeof mod.createConnection === 'function' ? mod : mod.default!
  const quiet = () => {}
  // The driver otherwise logs to a `snowflake.log` file in the working directory.
  sdk.configure({
    logLevel: 'ERROR',
    customLogger: { error: quiet, warn: quiet, info: quiet, debug: quiet, trace: quiet },
  })
  const conn = sdk.createConnection({
    ...opts,
    application: 'OpenSteward',
    clientSessionKeepAlive: false,
  })
  await new Promise<void>((resolve, reject) =>
    conn.connect((err) => (err ? reject(err) : resolve())),
  )
  return {
    execute(sqlText, binds) {
      return new Promise((resolve, reject) => {
        conn.execute({
          sqlText,
          binds,
          complete: (err, _stmt, rows) =>
            err ? reject(err) : resolve((rows ?? []) as Array<Record<string, unknown>>),
        })
      })
    },
    close() {
      return new Promise((resolve) => conn.destroy(() => resolve()))
    },
  }
}

export async function createSnowflakeLoader(
  config: SnowflakeConfig,
  secrets: SnowflakeSecrets,
  deps: SnowflakeLoaderDeps,
): Promise<TableSink> {
  const host = snowflakeHost(config)
  await deps.hostGuard(host)

  const stageCfg = config.stage
  if (!stageCfg.storageIntegration && !hasInlineStageCredentials(stageCfg.type, secrets)) {
    throw new DestinationConfigError(
      stageCfg.type === 'gcs'
        ? 'A GCS stage needs stage.storageIntegration: Snowflake reads GCS only through a storage integration.'
        : 'Set stage.storageIntegration, or the stage credentials Snowflake should read the stage with.',
    )
  }
  // Validate every name now: a bad one fails the build, not the first batch.
  const database = snowflakeIdent(config.database, 'database')
  const schema = snowflakeIdent(config.schema, 'schema')
  const readWith = stageCfg.storageIntegration
    ? `STORAGE_INTEGRATION = ${snowflakeIdent(stageCfg.storageIntegration, 'storageIntegration')}`
    : stageCfg.type === 's3'
      ? `CREDENTIALS = (AWS_KEY_ID = ${sqlLiteral(secrets.stageAccessKeyId!, 'stageAccessKeyId')} ` +
        `AWS_SECRET_KEY = ${sqlLiteral(secrets.stageSecretAccessKey!, 'stageSecretAccessKey')}` +
        (secrets.stageSessionToken
          ? ` AWS_TOKEN = ${sqlLiteral(secrets.stageSessionToken, 'stageSessionToken')}`
          : '') +
        ')'
      : `CREDENTIALS = (AZURE_SAS_TOKEN = ${sqlLiteral(secrets.stageSasToken!.replace(/^\?/, ''), 'stageSasToken')})`

  const stage = await createStage(stageCfg, secrets, 'snowflake', deps)
  const connect = deps.clientFactory ?? defaultClient
  const newId = deps.newId
  const now = deps.now ?? Date.now

  let client: SnowflakeClientLike | undefined
  async function sf(): Promise<SnowflakeClientLike> {
    if (!client) {
      const c = await connect({
        account: config.account,
        accessUrl: `https://${host}`,
        username: secrets.username,
        ...(secrets.privateKey
          ? {
              authenticator: 'SNOWFLAKE_JWT' as const,
              privateKey: secrets.privateKey,
              ...(secrets.privateKeyPassphrase
                ? { privateKeyPass: secrets.privateKeyPassphrase }
                : {}),
            }
          : { password: secrets.password }),
        warehouse: config.warehouse,
        database: config.database,
        schema: config.schema,
        ...(config.role ? { role: config.role } : {}),
      })
      // Fail fast (and pin the session) when the schema is missing or not granted.
      try {
        await c.execute(`USE SCHEMA ${database}.${schema}`)
      } catch (err) {
        await c.close().catch(() => {})
        throw err
      }
      client = c
    }
    return client
  }
  const exec = async (sql: string, binds?: SnowflakeBind[]) => (await sf()).execute(sql, binds)

  /** Table names are generated (`os_…`); quoted upper-case, unqualified (session schema). */
  const t = (table: string) => snowflakeIdent(assertGenerated(table, 'table'), 'table')

  async function copyInto(tempTable: string, file: StagedFile): Promise<void> {
    await exec(
      `COPY INTO ${t(tempTable)} FROM ${sqlLiteral(file.dirUrl, 'stage url')} ${readWith} ` +
        `FILES = (${sqlLiteral(file.name, 'file name')}) ` +
        `FILE_FORMAT = (TYPE = PARQUET USE_LOGICAL_TYPE = TRUE) ` +
        `MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE ON_ERROR = ABORT_STATEMENT FORCE = TRUE`,
    )
  }

  const driver: LoaderDriver = {
    async describe(table) {
      const rows = await exec(
        `SELECT COLUMN_NAME, DATA_TYPE FROM ${database}.INFORMATION_SCHEMA.COLUMNS ` +
          `WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [config.schema.toUpperCase(), table.toUpperCase()],
      )
      if (rows.length === 0) return null
      const cols = new Map<string, ColumnKind>()
      for (const r of rows) {
        cols.set(
          String(r['COLUMN_NAME']).toLowerCase(),
          kindOfSnowflakeType(String(r['DATA_TYPE'])),
        )
      }
      return cols
    },
    async createTable(table) {
      await exec(
        `CREATE TABLE IF NOT EXISTS ${t(table)} (` +
          `${q('_pk')} VARCHAR NOT NULL, ${q('connection_id')} VARCHAR, ${q('owner_tenant_id')} VARCHAR, ` +
          `${q('platform')} VARCHAR NOT NULL, ${q('vertical')} VARCHAR NOT NULL, ` +
          `${q('resource_type')} VARCHAR NOT NULL, ${q('resource_id')} VARCHAR NOT NULL, ` +
          `${q('changed_at')} TIMESTAMP_TZ NOT NULL, ${q('norm_version')} VARCHAR, ` +
          `${q('_deleted')} BOOLEAN NOT NULL DEFAULT FALSE, ${q('data')} VARIANT, ` +
          `${q('_exported_at')} TIMESTAMP_TZ, PRIMARY KEY (${q('_pk')}))`,
      )
    },
    async addColumns(table, columns) {
      for (const c of columns) {
        await exec(
          `ALTER TABLE ${t(table)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${SF_TYPE[c.kind]}`,
        )
      }
    },
    async mergeRows(table, file, columns) {
      const staging = `os_stage_${table}`
      const flat: Array<[string, string]> = columns.map((c) => [c.name, SF_TYPE[c.kind]])
      await exec(
        `CREATE OR REPLACE TEMPORARY TABLE ${t(staging)} (${columnList([...STAGE_FIXED, ...flat])})`,
      )
      try {
        await copyInto(staging, file)
        const cols = [...STAGE_FIXED.map(([n]) => n), ...columns.map((c) => c.name)]
        const value = (n: string) => (n === 'data' ? `PARSE_JSON(s.${q(n)})` : `s.${q(n)}`)
        const updates = cols
          .filter((n) => n !== '_pk')
          .map((n) => `${q(n)} = ${value(n)}`)
          .concat(`${q('_exported_at')} = CURRENT_TIMESTAMP()`)
        const res = await exec(
          `MERGE INTO ${t(table)} AS t USING ${t(staging)} AS s ON t.${q('_pk')} = s.${q('_pk')} ` +
            `WHEN MATCHED AND t.${q('changed_at')} <= s.${q('changed_at')} THEN UPDATE SET ${updates.join(', ')} ` +
            `WHEN NOT MATCHED THEN INSERT (${[...cols, '_exported_at'].map(q).join(', ')}) ` +
            `VALUES (${cols.map(value).join(', ')}, CURRENT_TIMESTAMP())`,
        )
        return countOf(res, 'number of rows inserted', 'number of rows updated')
      } finally {
        await exec(`DROP TABLE IF EXISTS ${t(staging)}`).catch(() => {})
      }
    },
    async applyDeletes(table, deletes, stageDeletes) {
      let n = 0
      const records = recordDeletes(deletes)
      if (records.length > 0) {
        const file = await stageDeletes(records)
        const staging = `os_del_${table}`
        await exec(`CREATE OR REPLACE TEMPORARY TABLE ${t(staging)} (${columnList(DELETE_STAGE)})`)
        try {
          await copyInto(staging, file)
          const res = await exec(
            `DELETE FROM ${t(table)} USING ${t(staging)} AS d ` +
              `WHERE ${t(table)}.${q('_pk')} = d.${q('_pk')} ` +
              `AND ${t(table)}.${q('changed_at')} <= d.${q('deleted_at')}`,
          )
          n += countOf(res, 'number of rows deleted')
        } finally {
          await exec(`DROP TABLE IF EXISTS ${t(staging)}`).catch(() => {})
        }
      }
      for (const d of wideDeletes(deletes)) n += await wideDelete(table, d)
      return n
    },
    async test(s) {
      const probe = `os_connection_test`
      const file = await s.upload(
        `${STAGE_DIR}/_connection_test/probe.parquet`,
        await rowsToParquet([probeRow(now())], { compression: 'snappy', columns: [] }),
        PARQUET_CONTENT_TYPE,
      )
      try {
        await exec(`CREATE OR REPLACE TEMPORARY TABLE ${t(probe)} (${columnList(STAGE_FIXED)})`)
        await copyInto(probe, file)
        await exec(`DROP TABLE IF EXISTS ${t(probe)}`)
      } finally {
        await s.remove(file.path).catch(() => {})
      }
    },
    async close() {
      const c = client
      client = undefined
      await c?.close()
    },
  }

  async function wideDelete(table: string, d: DeleteSpec): Promise<number> {
    // Epoch ms bound as a string: TO_NUMBER keeps it an exact integer.
    const at = `TO_TIMESTAMP_TZ(TO_NUMBER(?), 3)`
    const res =
      d.scope === 'connection'
        ? await exec(
            `DELETE FROM ${t(table)} WHERE ${q('platform')} = ? ` +
              `AND EQUAL_NULL(${q('connection_id')}, ?) AND ${q('changed_at')} <= ${at}`,
            [d.platform, d.connectionId, String(d.deletedAt)],
          )
        : await exec(`DELETE FROM ${t(table)} WHERE ${q('changed_at')} <= ${at}`, [
            String(d.deletedAt),
          ])
    return countOf(res, 'number of rows deleted')
  }

  return createLoaderSink({ stage, driver, newId })
}
