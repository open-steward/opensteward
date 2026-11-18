/**
 * Parquet encoding for exported rows and deletes.
 *
 * Arrow (`apache-arrow`) builds the columnar table in JS; `parquet-wasm`
 * (the Rust `parquet` crate compiled to WebAssembly) encodes it. Both are
 * loaded on first use, so a deployment that never configures a destination
 * never pays for the WASM module.
 *
 * Column types:
 *   fixed columns   Utf8, `changed_at`/`deleted_at` as TIMESTAMP(ms, UTC),
 *                   `_deleted` Bool, `data` Utf8 (the masked record as JSON)
 *   flattened       Bool when every value is a boolean, Int64 when every value
 *                   is a safe integer, Float64 when every value is a number,
 *                   otherwise Utf8 (mixed values are stringified)
 */
import type * as ArrowNS from 'apache-arrow'
import type * as ParquetNS from 'parquet-wasm'
import { FIXED_COLUMNS } from '../transform'
import type { DeleteSpec, ExportRow, ScalarValue } from '../types'

export type ParquetCompression = 'zstd' | 'snappy' | 'none'

export const PARQUET_CONTENT_TYPE = 'application/vnd.apache.parquet'

interface Libs {
  arrow: typeof ArrowNS
  parquet: typeof ParquetNS
}

let libs: Promise<Libs> | undefined

function loadLibs(): Promise<Libs> {
  libs ??= (async () => {
    const arrow = (await import('apache-arrow')) as typeof ArrowNS
    const pq = (await import('parquet-wasm')) as typeof ParquetNS & { default?: typeof ParquetNS }
    const parquet = typeof pq.writeParquet === 'function' ? pq : pq.default!
    return { arrow, parquet }
  })()
  return libs
}

/** A flattened column's type: Bool, Int64, Float64 or Utf8. */
export type ColumnKind = 'bool' | 'int' | 'float' | 'string'

/** A flattened column with a fixed type (a warehouse table's established column). */
export interface FlatColumn {
  name: string
  kind: ColumnKind
}

/**
 * The narrowest kind that holds every value: Bool when all are booleans,
 * Int64 when all are safe integers, Float64 when all are numbers (ints and
 * floats mixed), otherwise Utf8. No values at all is Utf8.
 */
export function inferKind(values: Array<ScalarValue | undefined>): ColumnKind {
  let kind: ColumnKind | null = null
  for (const v of values) {
    if (v === undefined) continue
    let k: ColumnKind
    if (typeof v === 'boolean') k = 'bool'
    else if (typeof v === 'number') k = Number.isSafeInteger(v) ? 'int' : 'float'
    else return 'string'
    if (kind === null) kind = k
    else if (kind !== k) {
      if ((kind === 'int' && k === 'float') || (kind === 'float' && k === 'int')) kind = 'float'
      else return 'string'
    }
  }
  return kind ?? 'string'
}

/**
 * A value as a column of `kind` holds it, or null when it does not fit —
 * the same rule the Postgres sink applies: `data` stays authoritative, and a
 * flattened column never changes type under a table that already has it.
 */
export function coerceToKind(
  v: ScalarValue | undefined,
  kind: ColumnKind,
): string | number | boolean | null {
  if (v === undefined) return null
  switch (kind) {
    case 'string':
      return String(v)
    case 'int':
      return typeof v === 'number' && Number.isSafeInteger(v) ? v : null
    case 'float':
      return typeof v === 'number' ? v : null
    case 'bool':
      return typeof v === 'boolean' ? v : null
  }
}

function flattenedVector(
  arrow: typeof ArrowNS,
  values: Array<ScalarValue | undefined>,
  fixedKind?: ColumnKind,
): ArrowNS.Vector {
  const kind = fixedKind ?? inferKind(values)
  const coerced = values.map((v) => coerceToKind(v, kind))
  switch (kind) {
    case 'bool':
      return arrow.vectorFromArray(coerced as Array<boolean | null>, new arrow.Bool())
    case 'int':
      return arrow.vectorFromArray(
        coerced.map((v) => (v === null ? null : BigInt(v as number))),
        new arrow.Int64(),
      )
    case 'float':
      return arrow.vectorFromArray(coerced as Array<number | null>, new arrow.Float64())
    default:
      return arrow.vectorFromArray(coerced as Array<string | null>, new arrow.Utf8())
  }
}

function compressionOf(parquet: typeof ParquetNS, c: ParquetCompression | undefined) {
  switch (c ?? 'zstd') {
    case 'snappy':
      return parquet.Compression.SNAPPY
    case 'none':
      return parquet.Compression.UNCOMPRESSED
    default:
      return parquet.Compression.ZSTD
  }
}

function encode(libs: Libs, table: ArrowNS.Table, compression?: ParquetCompression): Uint8Array {
  const { arrow, parquet } = libs
  const props = new parquet.WriterPropertiesBuilder()
    .setCompression(compressionOf(parquet, compression))
    .setCreatedBy('opensteward-destinations')
    .build()
  const wasmTable = parquet.Table.fromIPCStream(arrow.tableToIPC(table, 'stream'))
  return parquet.writeParquet(wasmTable, props)
}

/** Column order of a rows file: the fixed columns, then flattened fields sorted. */
export function rowColumns(rows: ExportRow[]): string[] {
  const extra = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r.fields)) extra.add(k)
  return [...FIXED_COLUMNS, ...[...extra].sort()]
}

export interface RowsParquetOptions {
  compression?: ParquetCompression
  /**
   * The flattened columns to write, in order, with fixed types — a warehouse
   * loader passes its target table's columns so the staged file matches it
   * exactly (every column present, a value that does not fit written as
   * null). Default: the rows' own fields, sorted, with inferred types.
   */
  columns?: FlatColumn[]
  /**
   * Unit of `changed_at`. Default `ms`; Iceberg requires `us`
   * (its `timestamptz` is microseconds).
   */
  timestampUnit?: 'ms' | 'us'
}

/** Encode export rows as one Parquet file. */
export async function rowsToParquet(
  rows: ExportRow[],
  opts: RowsParquetOptions = {},
): Promise<Uint8Array> {
  const l = await loadLibs()
  const { arrow } = l
  const utf8 = (pick: (r: ExportRow) => string | null) =>
    arrow.vectorFromArray(rows.map(pick), new arrow.Utf8())
  const columns: Record<string, ArrowNS.Vector> = {
    _pk: utf8((r) => r._pk),
    connection_id: utf8((r) => r.connection_id),
    owner_tenant_id: utf8((r) => r.owner_tenant_id),
    platform: utf8((r) => r.platform),
    vertical: utf8((r) => r.vertical),
    resource_type: utf8((r) => r.resource_type),
    resource_id: utf8((r) => r.resource_id),
    changed_at: arrow.vectorFromArray(
      rows.map((r) => r.changed_at),
      new arrow.Timestamp(
        opts.timestampUnit === 'us' ? arrow.TimeUnit.MICROSECOND : arrow.TimeUnit.MILLISECOND,
        'UTC',
      ),
    ),
    norm_version: utf8((r) => r.norm_version),
    _deleted: arrow.vectorFromArray(
      rows.map((r) => r._deleted),
      new arrow.Bool(),
    ),
    data: utf8((r) => r.data),
  }
  const flat: Array<{ name: string; kind?: ColumnKind }> =
    opts.columns ??
    rowColumns(rows)
      .slice(FIXED_COLUMNS.length)
      .map((name) => ({ name }))
  for (const col of flat) {
    columns[col.name] = flattenedVector(
      arrow,
      rows.map((r) => r.fields[col.name]),
      col.kind,
    )
  }
  return encode(l, new arrow.Table(columns), opts.compression)
}

/** Column order of a deletes file. */
export const DELETE_COLUMNS = [
  'tombstone_id',
  'scope',
  '_pk',
  'vertical',
  'platform',
  'connection_id',
  'owner_tenant_id',
  'resource_type',
  'resource_id',
  'deleted_at',
  '_deleted',
] as const

/** Encode deletes as one Parquet file (`_deletes/…`). */
export async function deletesToParquet(
  deletes: DeleteSpec[],
  opts: { compression?: ParquetCompression } = {},
): Promise<Uint8Array> {
  const l = await loadLibs()
  const { arrow } = l
  const utf8 = (pick: (d: DeleteSpec) => string | null) =>
    arrow.vectorFromArray(deletes.map(pick), new arrow.Utf8())
  const table = new arrow.Table({
    tombstone_id: arrow.vectorFromArray(
      deletes.map((d) => BigInt(d.tombstoneId)),
      new arrow.Int64(),
    ),
    scope: utf8((d) => d.scope),
    _pk: utf8((d) => d.pk),
    vertical: utf8((d) => d.vertical),
    platform: utf8((d) => d.platform),
    connection_id: utf8((d) => d.connectionId),
    owner_tenant_id: utf8((d) => d.ownerTenantId),
    resource_type: utf8((d) => d.resourceType),
    resource_id: utf8((d) => d.resourceId),
    deleted_at: arrow.vectorFromArray(
      deletes.map((d) => d.deletedAt),
      new arrow.Timestamp(arrow.TimeUnit.MILLISECOND, 'UTC'),
    ),
    _deleted: arrow.vectorFromArray(
      deletes.map(() => true),
      new arrow.Bool(),
    ),
  })
  return encode(l, table, opts.compression)
}

export interface ParquetReadResult {
  columns: Array<{ name: string; type: string }>
  rows: Array<Record<string, unknown>>
}

/**
 * Decode a Parquet file back to plain rows — for tests and tooling. Int64
 * values come back as `bigint`, timestamps as epoch ms.
 */
export async function readParquetRows(bytes: Uint8Array): Promise<ParquetReadResult> {
  const { arrow, parquet } = await loadLibs()
  const table = arrow.tableFromIPC(parquet.readParquet(bytes).intoIPCStream())
  return {
    columns: table.schema.fields.map((f) => ({ name: f.name, type: String(f.type) })),
    rows: table.toArray().map((r) => (r as { toJSON(): Record<string, unknown> }).toJSON()),
  }
}
