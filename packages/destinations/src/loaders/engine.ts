/**
 * The part every staged loader shares: turn one `applyBatch` into
 *
 *   1. dedupe the rows on `_pk` (the newest `changed_at` wins — a MERGE
 *      refuses two source rows for one target row);
 *   2. make sure the target table exists and has a column for every
 *      flattened field (up to MAX_FLATTENED_COLUMNS), remembering the
 *      table's columns between batches;
 *   3. write ONE Parquet file whose columns are exactly the table's — every
 *      flattened column present, each value coerced to the column's type or
 *      null — and upload it to the stage;
 *   4. hand it to the driver, which loads and MERGEs it;
 *   5. stage and apply the deletes, the same way;
 *   6. remove the staged files (unless the driver keeps them).
 *
 * Every step is idempotent — the MERGE only moves a row forward, a delete
 * only removes rows not newer than its tombstone — so a batch the worker
 * retries after a crash converges on the same table.
 */
import { randomUUID } from 'node:crypto'
import { FIXED_COLUMNS } from '../transform'
import { tableNameFor, MAX_FLATTENED_COLUMNS } from '../sinks/postgres'
import type { DeleteSpec, ExportRow, TableSink, TableTarget } from '../types'
import {
  PARQUET_CONTENT_TYPE,
  deletesToParquet,
  inferKind,
  rowsToParquet,
  type ColumnKind,
  type FlatColumn,
} from '../writers/parquet'
import type { Stage, StagedFile } from './stage'

/** Columns every loader table has that are not flattened fields. */
export const LOADER_FIXED_COLUMNS: ReadonlySet<string> = new Set([...FIXED_COLUMNS, '_exported_at'])

/** What a warehouse-specific driver implements. */
export interface LoaderDriver {
  /**
   * The table's columns, lower-cased name → kind (fixed columns included or
   * not — they are ignored), or null when the table does not exist.
   */
  describe(table: string): Promise<Map<string, ColumnKind> | null>
  /** Create the table with the fixed columns (IF NOT EXISTS). */
  createTable(table: string): Promise<void>
  /** Add flattened columns. */
  addColumns(table: string, columns: FlatColumn[]): Promise<void>
  /**
   * Load the staged rows file and merge it into the table. `columns` are the
   * file's flattened columns (= the table's); `rowCount` the rows in the file.
   * Returns rows inserted + updated.
   */
  mergeRows(
    table: string,
    file: StagedFile,
    columns: FlatColumn[],
    rowCount: number,
  ): Promise<number>
  /** Apply deletes. `stageDeletes` uploads a deletes file on demand. */
  applyDeletes(
    table: string,
    deletes: DeleteSpec[],
    stageDeletes: (specs: DeleteSpec[]) => Promise<StagedFile>,
  ): Promise<number>
  /** Prove the warehouse side works (the engine has already probed the stage). */
  test(stage: Stage): Promise<void>
  close(): Promise<void>
}

export interface LoaderSinkOptions {
  stage: Stage
  driver: LoaderDriver
  /** Default `os_<vertical>_<type>` (lower-case, ≤ 63 characters). */
  tableName?: (target: TableTarget) => string
  /** Where a batch's files go under the stage. */
  rowsPath?: (table: string, batchId: string) => string
  deletesPath?: (table: string, batchId: string) => string
  /** Keep staged files after the driver is done (Iceberg: they are the data). */
  keepStagedFiles?: boolean
  /** `changed_at` unit in the Parquet file. Default `ms`. */
  timestampUnit?: 'ms' | 'us'
  /** Batch ids (test seam). */
  newId?: () => string
}

/** Where staged files go by default; one directory per table. */
export const STAGE_DIR = '_opensteward_stage'

/** Keep the newest version of each `_pk` (ties: the later one). */
export function dedupeRows(rows: ExportRow[]): ExportRow[] {
  const byPk = new Map<string, ExportRow>()
  for (const r of rows) {
    const prev = byPk.get(r._pk)
    if (!prev || prev.changed_at <= r.changed_at) byPk.set(r._pk, r)
  }
  return byPk.size === rows.length ? rows : [...byPk.values()]
}

/**
 * The flattened columns to add for `rows`, given the table's existing ones:
 * new names sorted, each typed from this batch's values, capped so the
 * table never holds more than `max` flattened columns.
 */
export function planNewColumns(
  existing: ReadonlyMap<string, ColumnKind>,
  rows: ExportRow[],
  max = MAX_FLATTENED_COLUMNS,
): FlatColumn[] {
  const seen = new Map<string, Array<ExportRow['fields'][string]>>()
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.fields)) {
      if (existing.has(k) || LOADER_FIXED_COLUMNS.has(k)) continue
      const list = seen.get(k) ?? []
      list.push(v)
      seen.set(k, list)
    }
  }
  const room = max - [...existing.keys()].filter((k) => !LOADER_FIXED_COLUMNS.has(k)).length
  return [...seen.keys()]
    .sort()
    .slice(0, Math.max(0, room))
    .map((name) => ({ name, kind: inferKind(seen.get(name)!) }))
}

function flattenedOf(columns: ReadonlyMap<string, ColumnKind>): FlatColumn[] {
  return [...columns.entries()]
    .filter(([name]) => !LOADER_FIXED_COLUMNS.has(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, kind]) => ({ name, kind }))
}

function defaultId(): string {
  return randomUUID().replace(/-/g, '')
}

export function createLoaderSink(opts: LoaderSinkOptions): TableSink {
  const { stage, driver } = opts
  const tableName = opts.tableName ?? tableNameFor
  const newId = opts.newId ?? defaultId
  const rowsPath =
    opts.rowsPath ?? ((table: string, id: string) => `${STAGE_DIR}/${table}/${id}-rows.parquet`)
  const deletesPath =
    opts.deletesPath ??
    ((table: string, id: string) => `${STAGE_DIR}/${table}/${id}-deletes.parquet`)
  /** table → column → kind, as last seen in the warehouse. */
  const columnCache = new Map<string, Map<string, ColumnKind>>()

  async function describe(table: string): Promise<Map<string, ColumnKind> | null> {
    const cached = columnCache.get(table)
    if (cached) return cached
    const cols = await driver.describe(table)
    if (cols) columnCache.set(table, cols)
    return cols
  }

  async function ensureColumns(table: string, rows: ExportRow[]): Promise<FlatColumn[]> {
    let cols = await describe(table)
    if (!cols) {
      await driver.createTable(table)
      cols = (await driver.describe(table)) ?? new Map()
      columnCache.set(table, cols)
    }
    const added = planNewColumns(cols, rows)
    if (added.length > 0) {
      await driver.addColumns(table, added)
      for (const c of added) cols.set(c.name, c.kind)
    }
    return flattenedOf(cols)
  }

  return {
    kind: 'table',
    async test() {
      await stage.test()
      await driver.test(stage)
    },
    async applyBatch(target, rows, deletes) {
      const table = tableName(target)
      const staged: string[] = []
      const upload = async (path: string, bytes: Uint8Array): Promise<StagedFile> => {
        const file = await stage.upload(path, bytes, PARQUET_CONTENT_TYPE)
        staged.push(path)
        return file
      }
      try {
        let upserted = 0
        if (rows.length > 0) {
          const unique = dedupeRows(rows)
          const columns = await ensureColumns(table, unique)
          const bytes = await rowsToParquet(unique, {
            compression: 'snappy',
            columns,
            timestampUnit: opts.timestampUnit,
          })
          const file = await upload(rowsPath(table, newId()), bytes)
          upserted = await driver.mergeRows(table, file, columns, unique.length)
        }
        let deleted = 0
        if (deletes.length > 0 && (rows.length > 0 || (await describe(table)) !== null)) {
          deleted = await driver.applyDeletes(table, deletes, async (specs) =>
            upload(
              deletesPath(table, newId()),
              await deletesToParquet(specs, { compression: 'snappy' }),
            ),
          )
        }
        return { upserted, deleted }
      } catch (err) {
        // A failed DDL may have left the cache ahead of the warehouse.
        columnCache.delete(table)
        throw err
      } finally {
        if (!opts.keepStagedFiles) {
          for (const path of staged) await stage.remove(path).catch(() => {})
        }
      }
    },
    async close() {
      try {
        await driver.close()
      } finally {
        await stage.close().catch(() => {})
      }
    },
  }
}

/**
 * The record deletes, one per `_pk` — its newest tombstone, which covers
 * everything an older one for the same row would.
 */
export function recordDeletes(deletes: DeleteSpec[]): DeleteSpec[] {
  const byPk = new Map<string, DeleteSpec>()
  for (const d of deletes) {
    if (d.scope !== 'record' || d.pk === null) continue
    const prev = byPk.get(d.pk)
    if (!prev || prev.deletedAt <= d.deletedAt) byPk.set(d.pk, d)
  }
  return [...byPk.values()]
}

/** Deletes wider than one record, in feed order. */
export function wideDeletes(deletes: DeleteSpec[]): DeleteSpec[] {
  return deletes.filter((d) => d.scope !== 'record')
}

/** A probe row for connection tests: the fixed columns only. */
export function probeRow(now: number): ExportRow {
  return {
    _pk: 'opensteward:connection-test',
    connection_id: null,
    owner_tenant_id: null,
    platform: 'opensteward',
    vertical: 'opensteward',
    resource_type: 'connection_test',
    resource_id: 'probe',
    changed_at: now,
    norm_version: null,
    _deleted: false,
    data: '{}',
    fields: {},
  }
}
