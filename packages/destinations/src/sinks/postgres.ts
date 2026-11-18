/**
 * Postgres sink — one table per (vertical, resource type) in the operator's
 * own database.
 *
 * Table `<schema>.os_<vertical>_<resource_type>` (sanitised, ≤ 63 chars):
 *
 *   _pk TEXT PRIMARY KEY, connection_id, owner_tenant_id, platform,
 *   vertical, resource_type, resource_id, changed_at TIMESTAMPTZ,
 *   norm_version, _deleted BOOLEAN, data JSONB, _exported_at TIMESTAMPTZ,
 *   + one column per flattened top-level scalar field (added as seen)
 *
 * Rows upsert on `_pk`, and only move forward: a replayed older version
 * (at-least-once delivery) never overwrites a newer one. Tombstones are
 * applied as DELETEs guarded by `changed_at <= deleted_at`, so a record that
 * was deleted and later re-created is not removed by the old tombstone.
 *
 * `data` is authoritative. The flattened columns are a convenience: a value
 * that does not fit the column's established type is written as NULL there
 * (and is still in `data`).
 */
import type { Pool, PoolClient } from 'pg'
import { sanitizeColumnName, FIXED_COLUMNS } from '../transform'
import type {
  DeleteSpec,
  ExportRow,
  HostGuard,
  PostgresConfig,
  PostgresSecrets,
  ScalarValue,
  TableSink,
  TableTarget,
} from '../types'

export interface PostgresSinkDeps {
  hostGuard: HostGuard
}

/** Flattened columns beyond this many per table are not added (Postgres caps a table at 1600). */
export const MAX_FLATTENED_COLUMNS = 400
/** Bind parameters per statement stay well under Postgres's 65 535. */
const MAX_PARAMS = 30_000

type PgType = 'text' | 'bigint' | 'double precision' | 'boolean'

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** `os_<vertical>_<resource_type>`, sanitised, at most 63 characters. */
export function tableNameFor(target: TableTarget): string {
  return `os_${sanitizeColumnName(target.vertical)}_${sanitizeColumnName(target.resourceType)}`.slice(
    0,
    63,
  )
}

function pgTypeFor(values: ScalarValue[]): PgType {
  let t: PgType | null = null
  for (const v of values) {
    const k: PgType =
      typeof v === 'boolean'
        ? 'boolean'
        : typeof v === 'number'
          ? Number.isSafeInteger(v)
            ? 'bigint'
            : 'double precision'
          : 'text'
    if (t === null) t = k
    else if (t !== k) {
      if (
        (t === 'bigint' && k === 'double precision') ||
        (t === 'double precision' && k === 'bigint')
      ) {
        t = 'double precision'
      } else return 'text'
    }
  }
  return t ?? 'text'
}

function stripNul(s: string): string {
  return s.includes('\u0000') ? s.split('\u0000').join('') : s
}

/** A flattened value coerced to its column's type, or null when it doesn't fit. */
function coerce(v: ScalarValue | undefined, type: PgType): string | number | boolean | null {
  if (v === undefined) return null
  switch (type) {
    case 'text':
      return stripNul(String(v))
    case 'bigint':
      return typeof v === 'number' && Number.isSafeInteger(v) ? v : null
    case 'double precision':
      return typeof v === 'number' ? v : null
    case 'boolean':
      return typeof v === 'boolean' ? v : null
  }
}

/**
 * JSON text Postgres's jsonb accepts: it refuses the `\u0000` escape. Only a
 * real escape is dropped — one preceded by an even number of backslashes —
 * so a string that literally contains `\\u0000` survives intact.
 */
function jsonbSafe(json: string): string {
  return json.includes('\\u0000') ? json.replace(/(?<!\\)((?:\\\\)*)\\u0000/g, '$1') : json
}

export async function createPostgresSink(
  config: PostgresConfig,
  secrets: PostgresSecrets,
  deps: PostgresSinkDeps,
): Promise<TableSink> {
  await deps.hostGuard(config.host)
  const pgMod = (await import('pg')) as typeof import('pg') & { default?: typeof import('pg') }
  const PoolCtor = (pgMod.Pool ?? pgMod.default!.Pool) as typeof Pool
  const pool = new PoolCtor({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: secrets.password,
    max: 2,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 300_000,
    application_name: 'opensteward-destinations',
    ssl:
      config.ssl === 'disable'
        ? false
        : config.ssl === 'verify-full'
          ? { rejectUnauthorized: true, servername: config.host }
          : { rejectUnauthorized: false },
  })
  // An idle client erroring (server restart) must not crash the process.
  pool.on('error', () => {})

  const schema = quoteIdent(config.schema)
  /** table → column → type, as last seen in the database. */
  const columnCache = new Map<string, Map<string, PgType>>()

  async function ensureSchema(c: PoolClient): Promise<void> {
    // Probe first: CREATE SCHEMA IF NOT EXISTS still needs database-level
    // CREATE even when the schema exists, which a least-privilege user lacks.
    const exists = await c.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [config.schema])
    if (exists.rowCount === 0) await c.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  }

  async function tableExists(c: PoolClient, table: string): Promise<boolean> {
    const r = await c.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [
      `${schema}.${quoteIdent(table)}`,
    ])
    return r.rows[0]?.t != null
  }

  async function loadColumns(c: PoolClient, table: string): Promise<Map<string, PgType>> {
    const r = await c.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      [config.schema, table],
    )
    const m = new Map<string, PgType>()
    for (const row of r.rows) {
      const t = row.data_type as PgType
      m.set(row.column_name, ['bigint', 'double precision', 'boolean'].includes(t) ? t : 'text')
    }
    columnCache.set(table, m)
    return m
  }

  async function ensureTable(c: PoolClient, table: string): Promise<Map<string, PgType>> {
    const cached = columnCache.get(table)
    if (cached) return cached
    await ensureSchema(c)
    const t = `${schema}.${quoteIdent(table)}`
    await c.query(`
      CREATE TABLE IF NOT EXISTS ${t} (
        _pk             TEXT PRIMARY KEY,
        connection_id   TEXT,
        owner_tenant_id TEXT,
        platform        TEXT NOT NULL,
        vertical        TEXT NOT NULL,
        resource_type   TEXT NOT NULL,
        resource_id     TEXT NOT NULL,
        changed_at      TIMESTAMPTZ NOT NULL,
        norm_version    TEXT,
        _deleted        BOOLEAN NOT NULL DEFAULT false,
        data            JSONB NOT NULL,
        _exported_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)
    await c.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${table.slice(0, 50)}_conn_idx`)} ON ${t} (connection_id)`,
    )
    return loadColumns(c, table)
  }

  const FIXED = new Set<string>([...FIXED_COLUMNS, '_exported_at'])

  function flattenedOf(columns: Map<string, PgType>): string[] {
    return [...columns.keys()].filter((c) => !FIXED.has(c)).sort()
  }

  async function addColumns(
    c: PoolClient,
    table: string,
    columns: Map<string, PgType>,
    rows: ExportRow[],
  ): Promise<void> {
    const seen = new Map<string, ScalarValue[]>()
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.fields)) {
        if (columns.has(k)) continue
        const list = seen.get(k) ?? []
        list.push(v)
        seen.set(k, list)
      }
    }
    let room = MAX_FLATTENED_COLUMNS - flattenedOf(columns).length
    for (const name of [...seen.keys()].sort()) {
      if (room <= 0) break
      const type = pgTypeFor(seen.get(name)!)
      await c.query(
        `ALTER TABLE ${schema}.${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${quoteIdent(name)} ${type}`,
      )
      columns.set(name, type)
      room--
    }
  }

  async function upsert(
    c: PoolClient,
    table: string,
    columns: Map<string, PgType>,
    rows: ExportRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0
    const flat = flattenedOf(columns)
    const cols = [...FIXED_COLUMNS, ...flat]
    const perRow = cols.length
    const chunk = Math.max(1, Math.floor(MAX_PARAMS / perRow))
    const t = `${schema}.${quoteIdent(table)}`
    const updates = cols
      .filter((col) => col !== '_pk')
      .map((col) => `${quoteIdent(col)} = EXCLUDED.${quoteIdent(col)}`)
    updates.push('_exported_at = now()')
    let n = 0
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk)
      const params: unknown[] = []
      const tuples = slice.map((r) => {
        const values: unknown[] = [
          r._pk,
          r.connection_id,
          r.owner_tenant_id,
          r.platform,
          r.vertical,
          r.resource_type,
          r.resource_id,
          new Date(r.changed_at),
          r.norm_version,
          r._deleted,
          jsonbSafe(r.data),
          ...flat.map((col) => coerce(r.fields[col], columns.get(col)!)),
        ]
        const placeholders = values.map((v, j) => {
          params.push(v)
          const p = `$${params.length}`
          return cols[j] === 'data' ? `${p}::jsonb` : p
        })
        return `(${placeholders.join(', ')})`
      })
      const res = await c.query(
        `INSERT INTO ${t} (${cols.map(quoteIdent).join(', ')}) VALUES ${tuples.join(', ')}
         ON CONFLICT (_pk) DO UPDATE SET ${updates.join(', ')}
         WHERE ${t}.changed_at <= EXCLUDED.changed_at`,
        params,
      )
      n += res.rowCount ?? 0
    }
    return n
  }

  async function applyDeletes(
    c: PoolClient,
    table: string,
    deletes: DeleteSpec[],
  ): Promise<number> {
    if (deletes.length === 0) return 0
    const t = `${schema}.${quoteIdent(table)}`
    let n = 0
    const records = deletes.filter((d) => d.scope === 'record' && d.pk !== null)
    for (let i = 0; i < records.length; i += 5000) {
      const slice = records.slice(i, i + 5000)
      const res = await c.query(
        `DELETE FROM ${t} AS t
          USING unnest($1::text[], $2::timestamptz[]) AS d(pk, at)
          WHERE t._pk = d.pk AND t.changed_at <= d.at`,
        [slice.map((d) => d.pk), slice.map((d) => new Date(d.deletedAt))],
      )
      n += res.rowCount ?? 0
    }
    for (const d of deletes) {
      if (d.scope === 'connection') {
        const res = await c.query(
          `DELETE FROM ${t}
            WHERE platform = $1 AND connection_id IS NOT DISTINCT FROM $2 AND changed_at <= $3`,
          [d.platform, d.connectionId, new Date(d.deletedAt)],
        )
        n += res.rowCount ?? 0
      } else if (d.scope === 'vertical' || d.scope === 'all') {
        const res = await c.query(`DELETE FROM ${t} WHERE changed_at <= $1`, [
          new Date(d.deletedAt),
        ])
        n += res.rowCount ?? 0
      }
    }
    return n
  }

  return {
    kind: 'table',
    async test() {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        await ensureSchema(c)
        await c.query(`CREATE TABLE ${schema}._opensteward_connection_test (id int)`)
      } finally {
        await c.query('ROLLBACK').catch(() => {})
        c.release()
      }
    },
    async applyBatch(target, rows, deletes) {
      const table = tableNameFor(target)
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        let upserted = 0
        if (rows.length > 0) {
          const columns = await ensureTable(c, table)
          await addColumns(c, table, columns, rows)
          upserted = await upsert(c, table, columns, rows)
        }
        let deleted = 0
        if (deletes.length > 0 && (rows.length > 0 || (await tableExists(c, table)))) {
          deleted = await applyDeletes(c, table, deletes)
        }
        await c.query('COMMIT')
        return { upserted, deleted }
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {})
        // A failed DDL may have left the cache ahead of the database.
        columnCache.delete(table)
        throw err
      } finally {
        c.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}
