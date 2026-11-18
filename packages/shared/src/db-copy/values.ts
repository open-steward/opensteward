/**
 * Value translation between the two dialects.
 *
 * Every store in this repo writes the SAME JS values on both backends —
 * epoch-ms integers, JSON as TEXT, encrypted credentials as base64 TEXT — so
 * for the real schemas almost everything passes through untouched and
 * ciphertext stays byte-identical. The translation below exists for the
 * places the DDL does diverge, and for column types a future migration may
 * introduce: SQLite has no BOOLEAN / BYTEA / JSONB / TIMESTAMPTZ and stores
 * them as INTEGER / BLOB / TEXT / INTEGER-or-TEXT.
 *
 * Reads are lossless by construction: SQLite integers are read as BigInt
 * (`safeIntegers`) and Postgres int8 / numeric / json / timestamps as their
 * text form, then narrowed to a JS number only when that is exact.
 */
import { DbCopyError } from './errors'

/** What a target Postgres column wants, from information_schema.data_type. */
export type PgClass =
  'bool' | 'bytes' | 'int' | 'num' | 'json' | 'text' | 'time' | 'array' | 'other'

/** SQLite type affinity of a declared column type (sqlite.org/datatype3.html §3.1). */
export type SqliteAffinity = 'INTEGER' | 'TEXT' | 'BLOB' | 'REAL' | 'NUMERIC'

export function pgClassOf(dataType: string): PgClass {
  const t = dataType.toLowerCase()
  if (t === 'boolean') return 'bool'
  if (t === 'bytea') return 'bytes'
  if (t === 'smallint' || t === 'integer' || t === 'bigint') return 'int'
  if (t === 'numeric' || t === 'real' || t === 'double precision') return 'num'
  if (t === 'json' || t === 'jsonb') return 'json'
  if (t === 'text' || t.startsWith('character') || t === 'uuid' || t === 'citext') return 'text'
  if (t.startsWith('timestamp') || t === 'date' || t.startsWith('time')) return 'time'
  if (t === 'array') return 'array'
  return 'other'
}

export function sqliteAffinityOf(declared: string): SqliteAffinity {
  const t = declared.toUpperCase()
  if (t.includes('INT')) return 'INTEGER'
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'TEXT'
  if (t === '' || t.includes('BLOB')) return 'BLOB'
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'REAL'
  return 'NUMERIC'
}

/** BigInt → number when exact, else the BigInt. */
export function narrowBigInt(v: bigint): number | bigint {
  return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(v)
    : v
}

/** An int8 read as text from Postgres, as the narrowest exact JS value. */
export function parseInt8(text: string): number | bigint {
  return narrowBigInt(BigInt(text))
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Buffer.isBuffer(v)) return 'blob'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function reject(where: string, v: unknown, want: string): never {
  // Names the column and the kinds of value, never the value itself.
  throw new DbCopyError(
    'FAILED',
    `${where}: cannot store a ${typeName(v)} value in a ${want} column`,
  )
}

function parseBoolText(where: string, s: string): boolean {
  const t = s.trim().toLowerCase()
  if (t === '1' || t === 't' || t === 'true' || t === 'y' || t === 'yes' || t === 'on') return true
  if (t === '0' || t === 'f' || t === 'false' || t === 'n' || t === 'no' || t === 'off')
    return false
  return reject(where, s, 'boolean')
}

/** A value read from either backend → a parameter for a Postgres column. */
export function toPg(v: unknown, cls: PgClass, where: string): unknown {
  if (v === null || v === undefined) return null
  switch (cls) {
    case 'bool':
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      if (typeof v === 'bigint') return v !== 0n
      if (typeof v === 'string') return parseBoolText(where, v)
      return reject(where, v, 'boolean')
    case 'bytes':
      if (Buffer.isBuffer(v)) return v
      if (v instanceof Uint8Array) return Buffer.from(v)
      // A TEXT value in a SQLite BLOB column: keep its exact bytes.
      if (typeof v === 'string') return Buffer.from(v, 'utf8')
      return reject(where, v, 'bytea')
    case 'int':
      if (typeof v === 'number' || typeof v === 'string') return v
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'boolean') return v ? 1 : 0
      return reject(where, v, 'integer')
    case 'num':
      if (typeof v === 'number' || typeof v === 'string') return v
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'boolean') return v ? 1 : 0
      return reject(where, v, 'numeric')
    case 'json':
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v)
      if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v)
      return reject(where, v, 'json')
    case 'text':
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v)
      if (Array.isArray(v) || (typeof v === 'object' && !Buffer.isBuffer(v)))
        return JSON.stringify(v)
      return reject(where, v, 'text')
    case 'time':
      if (typeof v === 'string' || v instanceof Date) return v
      if (typeof v === 'number') return new Date(v).toISOString()
      if (typeof v === 'bigint') return new Date(Number(v)).toISOString()
      return reject(where, v, 'timestamp')
    case 'array':
      if (Array.isArray(v)) return v
      if (typeof v === 'string') {
        try {
          const parsed: unknown = JSON.parse(v)
          if (Array.isArray(parsed)) return parsed
        } catch {
          /* fall through */
        }
      }
      return reject(where, v, 'array')
    case 'other':
      if (typeof v === 'bigint') return v.toString()
      return v
  }
}

/**
 * A value read from either backend → a parameter for a SQLite column.
 * `sourceIsTime` marks a Postgres timestamp read as text, which an INTEGER
 * column stores as epoch milliseconds.
 */
export function toSqlite(v: unknown, affinity: SqliteAffinity, sourceIsTime = false): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return narrowBigInt(v)
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  if (v instanceof Date)
    return affinity === 'TEXT' || affinity === 'BLOB' ? v.toISOString() : v.getTime()
  if (typeof v === 'string' && sourceIsTime && affinity === 'INTEGER') {
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? v : ms
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}
