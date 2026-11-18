/**
 * ResourceStore — backend-agnostic persistence for canonical resources fetched
 * from upstream platforms across every vertical.
 *
 * Schema:
 *   resources(pk, vertical, platform, tenant_id, resource_type, resource_id, data, fetched_at, updated_at)
 *   pk = "vertical:platform:tenantId:resourceType:resourceId"
 *
 * One backend holds rows for every vertical; rows are isolated via the
 * `vertical` column. The `tenant_id` column carries the connection_id.
 *
 * Used by `cached-router-helpers.ts` for read-through caching: GET requests
 * return the DB copy unless `?is_live=true` forces a fresh upstream fetch.
 * Writes (create/update/delete) call upstream first and then write-through
 * to the local copy.
 *
 * SHARES its `DbHandle` with the sibling SyncStore (both sit in the same
 * data-store backend so workers and cached reads use a single connection).
 * BORROWER — the handle is owned by the boot layer and MUST NOT be closed
 * here. SyncStore borrows the handle via `getHandle()`.
 */

import { createHash } from 'node:crypto'
import type { sql as SqlTag, RawBuilder } from 'kysely' with { 'resolution-mode': 'import' }
import type { DbHandle, DualMigration, KyselyDb } from '../db/types'
import { stripRawPayload } from './strip-raw-payload'

interface ResourceRow {
  data: string
  updated_at: number
}

interface ResourceListRow {
  resource_id: string
  data: string
  updated_at: number
}

export interface ReadOptions {
  /** Only serve rows written by this normalizer. Omit to ignore the column. */
  normVersion?: string
  /** Reject rows older than this many ms. `get` returns null; `list`
   *  returns []. Default: no TTL — every row is considered fresh. */
  maxAgeMs?: number
}

// Epoch-millisecond columns (fetched_at, updated_at) are INTEGER on SQLite and
// BIGINT on Postgres (the PostgresDbHandle parses int8 back to a JS number).
// `data` is a JSON-as-TEXT column on both dialects (the store serialises /
// parses in JS). The composite lookup index is valid verbatim on both.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS resources (
        pk            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        resource_type TEXT NOT NULL,
        resource_id   TEXT NOT NULL,
        data          TEXT NOT NULL,
        fetched_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resources_lookup
        ON resources (vertical, platform, tenant_id, resource_type);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS resources (
        pk            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        resource_type TEXT NOT NULL,
        resource_id   TEXT NOT NULL,
        data          TEXT NOT NULL,
        fetched_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resources_lookup
        ON resources (vertical, platform, tenant_id, resource_type);
    `,
  },
  {
    // Completeness is recorded, not inferred.
    //
    // The list read path treated "rows exist for this collection" as "all rows
    // exist", and rows arrive from writes that prove nothing about the whole:
    // a single `cachedGet` stores one record, after which an unfiltered list
    // served that one record as the entire collection — a cache hit, no
    // upstream call, and `hasMore: false` to confirm it. Observed live.
    //
    // Only a write that can prove it wrote the whole collection sets a row
    // here; every mutation clears it.
    version: 2,
    sqlite: `
      CREATE TABLE IF NOT EXISTS collection_sync (
        pk            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        resource_type TEXT NOT NULL,
        synced_at     INTEGER NOT NULL
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS collection_sync (
        pk            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        resource_type TEXT NOT NULL,
        synced_at     BIGINT NOT NULL
      );
    `,
  },
  {
    // Which normalizer produced each row.
    //
    // Records are stored in NORMALIZED form, so a deploy that changes a
    // transform leaves every existing row in the old shape — and nothing
    // invalidated them. A contact kept `billingAddress: {}` and an invoice
    // kept a fabricated `T00:00:00.000Z` for hours after both were fixed,
    // while the live path returned the corrected shapes for the same records.
    //
    // Stamping the version and filtering reads on it means a normalizer change
    // invalidates exactly the rows it affects, with no deploy step to forget
    // and correct behaviour on rollback.
    version: 3,
    sqlite: `
      ALTER TABLE resources ADD COLUMN norm_version TEXT;
      ALTER TABLE collection_sync ADD COLUMN norm_version TEXT;
    `,
    postgres: `
      ALTER TABLE resources ADD COLUMN IF NOT EXISTS norm_version TEXT;
      ALTER TABLE collection_sync ADD COLUMN IF NOT EXISTS norm_version TEXT;
    `,
  },
  {
    // A change watermark that means "the data changed".
    //
    // `updated_at` is re-stamped on every write, changed or not — a full sync
    // re-writes every row, and `sweepCollection` depends on exactly that. So it
    // cannot tell a destination what changed. `changed_at` moves only when the
    // stored JSON's hash (`data_hash`) differs from the previous write.
    //
    // Rows written before this migration have NULL here; reads treat NULL as
    // `updated_at` (COALESCE) and `backfillChangedAt` fills them in batches at
    // boot. The browse index serves the data viewer's keyset pages; the change
    // index serves `changesSince`.
    version: 4,
    sqlite: `
      ALTER TABLE resources ADD COLUMN changed_at INTEGER;
      ALTER TABLE resources ADD COLUMN data_hash TEXT;
      CREATE INDEX IF NOT EXISTS idx_resources_browse
        ON resources (tenant_id, resource_type, updated_at, pk);
      CREATE INDEX IF NOT EXISTS idx_resources_changes
        ON resources (vertical, resource_type, changed_at, pk);
    `,
    postgres: `
      ALTER TABLE resources ADD COLUMN IF NOT EXISTS changed_at BIGINT;
      ALTER TABLE resources ADD COLUMN IF NOT EXISTS data_hash TEXT;
      CREATE INDEX IF NOT EXISTS idx_resources_browse
        ON resources (tenant_id, resource_type, updated_at, pk);
      CREATE INDEX IF NOT EXISTS idx_resources_changes
        ON resources (vertical, resource_type, changed_at, pk);
    `,
  },
  {
    // Deletions a change feed can see.
    //
    // A deleted row leaves nothing behind for `changesSince` to report, so a
    // destination mirroring the store would keep it forever. Every delete path
    // writes one row here. NULL columns widen the scope: NULL resource_type /
    // resource_id = the whole connection (`deleteConnection`); NULL platform
    // and connection = a whole vertical (`deleteAll(vertical)`); all NULL =
    // everything (`deleteAll()`). `id` is the feed cursor.
    version: 5,
    sqlite: `
      CREATE TABLE IF NOT EXISTS resource_tombstones (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        vertical      TEXT,
        platform      TEXT,
        connection_id TEXT,
        resource_type TEXT,
        resource_id   TEXT,
        deleted_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resource_tombstones_deleted_at
        ON resource_tombstones (deleted_at);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS resource_tombstones (
        id            BIGSERIAL PRIMARY KEY,
        vertical      TEXT,
        platform      TEXT,
        connection_id TEXT,
        resource_type TEXT,
        resource_id   TEXT,
        deleted_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_resource_tombstones_deleted_at
        ON resource_tombstones (deleted_at);
    `,
  },
]

/**
 * Whether a vertical's upstream payload may be kept, read per request.
 *
 * A function rather than a boolean so an operator's flip in the admin UI lands
 * on the next settings poll instead of needing a restart — the same shape as
 * the MCP kill switch.
 */
export type RawPayloadPolicy = (vertical: string) => boolean

/** Default when no policy is supplied: keep everything. */
const KEEP_ALL: RawPayloadPolicy = () => true

// ── Browse / change-feed types ───────────────────────────────────────────

export type PageSort = 'updated_at' | 'resource_id'
export type PageDir = 'asc' | 'desc'
export type PageFilterOp = 'eq' | 'contains' | 'gt' | 'lt' | 'is_null'

export interface PageFilter {
  /** Dotted JSON path into the stored record, e.g. `status` or `billingAddress.city`. */
  path: string
  op: PageFilterOp
  value?: string | number | boolean | null
}

export interface PageOptions {
  vertical?: string
  /** Connection ids (the `tenant_id` column). Empty → empty page. */
  connectionIds: string[]
  resourceType: string
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string | null
  /** 1..200, default 50. */
  limit?: number
  sort?: PageSort
  dir?: PageDir
  filters?: PageFilter[]
  /** Free-text search: `contains` over `searchPaths` and the resource id. */
  q?: string
  searchPaths?: string[]
}

export interface StoredResource<T = unknown> {
  resourceId: string
  resourceType: string
  vertical: string
  platform: string
  connectionId: string | null
  data: T
  fetchedAt: number
  updatedAt: number
  changedAt: number
  normVersion: string | null
}

export interface ResourcePage<T = unknown> {
  items: Array<StoredResource<T>>
  nextCursor: string | null
  /** Rows matching the filters, counted up to `PAGE_COUNT_CAP + 1`. */
  total: number
  /** True when `total` hit the cap — the real count is larger. */
  totalCapped: boolean
}

export interface ChangesSinceOptions {
  vertical: string
  resourceType: string
  /** Restrict to these connections. Omit for all. */
  connectionIds?: string[]
  /** Watermark from the previous batch; omit to start from the beginning. */
  afterChangedAt?: number
  afterPk?: string
  limit?: number
  /**
   * Rows changed within the last `lagMs` are held back: a write stamped at T
   * can commit after a reader has already passed T. Default 120 000 ms.
   */
  lagMs?: number
}

export interface ChangeBatch<T = unknown> {
  items: Array<StoredResource<T> & { pk: string }>
  /** Pass back as `afterChangedAt` / `afterPk`; null when the batch was empty. */
  next: { afterChangedAt: number; afterPk: string } | null
}

export interface Tombstone {
  id: number
  vertical: string | null
  platform: string | null
  connectionId: string | null
  resourceType: string | null
  resourceId: string | null
  deletedAt: number
}

export interface ConnectionResourceCount {
  connectionId: string | null
  vertical: string
  platform: string
  resourceType: string
  count: number
  maxChangedAt: number | null
}

/**
 * One aggregate query over stored records — what the dashboard metric catalog
 * compiles its definitions into. Every path is a validated dotted data path,
 * bound as a parameter, never interpolated.
 */
export interface AggregateOptions {
  connectionIds: readonly string[]
  vertical?: string
  resourceType: string
  /**
   * Data path of an ISO date or datetime field. Rows whose value is not a
   * `YYYY-MM-DD…` string are left out whenever it is set.
   */
  dateField?: string
  /** Inclusive lower bound on the date field's day, `YYYY-MM-DD`. */
  from?: string
  /** Inclusive upper bound on the date field's day, `YYYY-MM-DD`. */
  to?: string
  /** Bucket by the date field's day (`day` in each row). Needs `dateField`. */
  byDay?: boolean
  /** Group by this field's text value (`group` in each row). */
  groupField?: string
  /** Sum this numeric field (`sum` in each row; non-numbers are ignored). */
  sumField?: string
}

export interface AggregateRow {
  /** `YYYY-MM-DD` when `byDay`, otherwise null. */
  day: string | null
  /** The group field's text value when `groupField` is set (null when absent). */
  group: string | null
  count: number
  /** Sum of `sumField` over the rows, or null when none carried a number. */
  sum: number | null
}

// ── Metric queries (aggregateV2 / fetchValues / lookupLabels) ────────────

/**
 * Row predicates a metric definition may apply. The `*_now` / `*_days` ops
 * compare the field's DAY (`YYYY-MM-DD`, the first ten characters of the
 * stored ISO text) with today's UTC day — the same day arithmetic the range
 * filter uses:
 *
 *   before_now          day <  today
 *   after_now           day >= today        (before_now's complement)
 *   older_than_days n   day <  today − n
 *   within_last_days n  today − n <= day <= today
 *   within_next_days n  today <= day <= today + n
 *
 * `ne` and `not_in` keep records where the field is absent: "type is not
 * BILL" includes a document with no type. `in_ci` compares lower-cased text.
 */
export const METRIC_FILTER_OPS = [
  'eq',
  'ne',
  'in',
  'not_in',
  'in_ci',
  'is_null',
  'not_null',
  'gt',
  'gte',
  'lt',
  'lte',
  'before_now',
  'after_now',
  'older_than_days',
  'within_last_days',
  'within_next_days',
] as const
export type MetricFilterOp = (typeof METRIC_FILTER_OPS)[number]

export interface MetricStoreFilter {
  /** Dotted data path. */
  path: string
  op: MetricFilterOp
  value?: string | number | boolean | ReadonlyArray<string | number>
}

export const FIELD_COMPARE_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'] as const
export type FieldCompareOp = (typeof FIELD_COMPARE_OPS)[number]

/**
 * `left op right` over two fields of the same record. Numbers compare as
 * numbers; dates compare by day (`paidAt <= dueAt` holds for a payment on the
 * due date even when one side carries a time). A record missing either side,
 * or whose sides are neither both numbers nor both dates, never matches.
 */
export interface MetricStoreCompare {
  left: string
  op: FieldCompareOp
  right: string
}

/**
 * One grouping key of an `aggregateV2` row.
 *
 * - `field` — the field's text value; `unnest` counts each element of a
 *   string array instead (at most one unnest per query)
 * - `date`  — a bucket of a date field: `day` `YYYY-MM-DD`, `week` ISO
 *   `YYYY-Www`, `month` `YYYY-MM`, `weekday` ISO `1` (Mon) … `7` (Sun) and
 *   `hour` `00` … `23`. `weekday` and `hour` are UTC (an offset in the stored
 *   text is applied); `hour` is null for a calendar date with no time.
 * - `band`  — index of the numeric band: `0` below `edges[0]`, `i` in
 *   [`edges[i-1]`, `edges[i]`), `edges.length` at or above the last edge
 * - `age`   — index of the day-distance band from today: `past` measures
 *   days since the date, `future` days until it; `0` is ≤ `edges[0]`, `i` is
 *   (`edges[i-1]`, `edges[i]`], `edges.length` beyond the last edge
 *
 * Keys come back as text (or null when the record has no such value).
 */
export type AggregateDimension =
  | { type: 'field'; path: string; unnest?: boolean }
  | { type: 'date'; path: string; unit: 'day' | 'week' | 'month' | 'weekday' | 'hour' }
  | { type: 'band'; path: string; edges: readonly number[] }
  | { type: 'age'; path: string; direction: 'past' | 'future'; edges: readonly number[] }

/** Which records a metric query reads — shared by `aggregateV2` and `fetchValues`. */
export interface MetricQueryBase {
  connectionIds: readonly string[]
  vertical?: string
  resourceType: string
  /** Range anchor: rows whose value is not `YYYY-MM-DD…` are left out when set. */
  dateField?: string
  /** Inclusive lower bound on the date field's day, `YYYY-MM-DD`. */
  from?: string
  /** Inclusive upper bound on the date field's day, `YYYY-MM-DD`. */
  to?: string
  filters?: readonly MetricStoreFilter[]
  compare?: readonly MetricStoreCompare[]
  /** "Now" for the relative filters and `age` bands. Default: the clock. */
  now?: Date
}

export interface AggregateV2Options extends MetricQueryBase {
  /** Up to three grouping keys (e.g. bucket × split × currency). */
  dimensions?: readonly AggregateDimension[]
  /** Numeric path summed and averaged per group (non-numbers ignored). */
  valueField?: string
}

export interface AggregateV2Row {
  /** One key per dimension, in order. */
  keys: Array<string | null>
  count: number
  /** Sum of `valueField` over the group; null when no row carried a number. */
  sum: number | null
  /** Rows of the group whose `valueField` was a number. */
  valueCount: number
  /** `sum / valueCount`, or null. */
  avg: number | null
}

/** Cap on the rows one `fetchValues` call returns (above it: a systematic sample). */
export const FETCH_VALUES_CAP = 50_000

export interface FetchValuesOptions extends MetricQueryBase {
  /** The values returned per row, in order: text, or a number (null when not numeric). */
  fields: ReadonlyArray<{ path: string; as: 'text' | 'number' }>
  /** Row cap, at most (and by default) `FETCH_VALUES_CAP`. */
  limit?: number
}

export interface FetchValuesResult {
  rows: Array<Array<string | number | null>>
  /** Rows matching the query. */
  total: number
  /** True when `total` exceeded the cap and `rows` is every k-th row by pk. */
  sampled: boolean
}

/** One read of `distinctValues`. */
export interface DistinctValuesSelect {
  connectionIds: readonly string[]
  vertical?: string
  resourceType: string
  path: string
}

export interface LookupLabelsOptions {
  connectionIds: readonly string[]
  vertical?: string
  resourceType: string
  /** Path of the key the ids are matched on (`id`). */
  keyPath: string
  /** Path of the display label. */
  labelPath: string
  keys: readonly string[]
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIMENSIONS = 3
const DAY_MS = 86_400_000

// Postgres casts ISO text to a date / timestamp only after these match, so a
// malformed value yields NULL instead of failing the whole query. The date
// part accepts real calendar days only — years 0001–9999 (Postgres has no
// year 0), leap years included — and offsets up to ±14:00, the widest in
// use; anything Postgres could not cast never reaches the cast. SQLite gets
// the same answer from `sqliteDateOk` / `sqliteInstantOk`.
const PG_YEAR = '(000[1-9]|00[1-9]\\d|0[1-9]\\d{2}|[1-9]\\d{3})'
const PG_LEAP_YEAR = '(\\d\\d(0[48]|[2468][048]|[13579][26])|(0[48]|[2468][048]|[13579][26])00)'
const PG_DATE =
  `(${PG_YEAR}-(0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])` +
  `|${PG_YEAR}-(0[469]|11)-(0[1-9]|[12]\\d|30)` +
  `|${PG_YEAR}-02-(0[1-9]|1\\d|2[0-8])` +
  `|${PG_LEAP_YEAR}-02-29)`
const PG_TIME = '[T ]([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d+)?)?'
const PG_OFFSET = '(Z|[+-](0\\d|1[0-3]):?[0-5]\\d|[+-]14:?00)'
const PG_DATE_ONLY_RE = `^${PG_DATE}$`
const PG_DATE_PREFIX_RE = `^${PG_DATE}`
const PG_DATETIME_OFFSET_RE = `^${PG_DATE}${PG_TIME}${PG_OFFSET}$`
const PG_DATETIME_LOCAL_RE = `^${PG_DATE}${PG_TIME}$`
/** Widest offset accepted, minutes (±14:00), plus slack for fractional seconds. */
const MAX_OFFSET_MINUTES = 840.02

/** Whitelisted SQL operators — the only text ever spliced into metric SQL. */
const SQL_CMP: Record<FieldCompareOp, string> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  eq: '=',
  ne: '<>',
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function daysValue(f: MetricStoreFilter): number {
  const v = f.value
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ResourcePageError(
      'INVALID_FILTER',
      `Filter '${f.path}' ${f.op} needs a whole number of days.`,
    )
  }
  return v
}

function assertEdges(edges: readonly number[], what: string): void {
  if (
    edges.length === 0 ||
    edges.some((e) => typeof e !== 'number' || !Number.isFinite(e)) ||
    edges.some((e, i) => i > 0 && e <= edges[i - 1]!)
  ) {
    throw new ResourcePageError('INVALID_FILTER', `${what} edges must be ascending numbers.`)
  }
}

/** A `page()` request the store refuses — the router maps `code` to a 400. */
export class ResourcePageError extends Error {
  constructor(
    readonly code: 'INVALID_PATH' | 'INVALID_CURSOR' | 'INVALID_FILTER',
    message: string,
  ) {
    super(message)
    this.name = 'ResourcePageError'
  }
}

export const PAGE_MAX_LIMIT = 200
export const PAGE_COUNT_CAP = 10_000
export const CHANGES_DEFAULT_LAG_MS = 120_000
const PATH_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

export function isValidDataPath(path: string): boolean {
  return PATH_RE.test(path)
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

interface CursorBody {
  v: 1
  o: string
  s: number | string
  k: string
}

function encodeCursor(body: CursorBody): string {
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string, order: string): CursorBody {
  let body: unknown
  try {
    body = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new ResourcePageError('INVALID_CURSOR', 'Cursor is not valid.')
  }
  const b = body as Partial<CursorBody> | null
  if (
    !b ||
    b.v !== 1 ||
    typeof b.k !== 'string' ||
    (typeof b.s !== 'number' && typeof b.s !== 'string')
  ) {
    throw new ResourcePageError('INVALID_CURSOR', 'Cursor is not valid.')
  }
  if (b.o !== order) {
    throw new ResourcePageError('INVALID_CURSOR', 'Cursor was issued for a different sort order.')
  }
  return b as CursorBody
}

interface StoredRow {
  pk: string
  vertical: string
  platform: string
  tenant_id: string | null
  resource_type: string
  resource_id: string
  data: string
  fetched_at: number
  updated_at: number
  changed_at: number
  norm_version: string | null
}

export class ResourceStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly rawPayloadEnabled: RawPayloadPolicy,
    // kysely is ESM-only and this package compiles as CommonJS, so the `sql`
    // tag is loaded once by `create()` through a dynamic import (see ../db/sqlite).
    private readonly sql: typeof SqlTag,
  ) {}

  /**
   * Open the store: apply migrations against the shared handle, then return the
   * instance. BORROWER — the handle is owned by the boot layer and MUST NOT be
   * closed here.
   *
   * `rawPayloadEnabled` gates the upstream payload on payments and accounting.
   * Applied on BOTH write and read: the write keeps it out of new rows, and
   * the read also covers rows written while payloads were still kept, so
   * flipping the flag off protects immediately rather than after a purge.
   * Omit it and everything is kept.
   */
  static async create(
    handle: DbHandle,
    opts?: { rawPayloadEnabled?: RawPayloadPolicy },
  ): Promise<ResourceStore> {
    await handle.migrate('resources', MIGRATIONS)
    const { sql } = await import('kysely')
    return new ResourceStore(handle, opts?.rawPayloadEnabled ?? KEEP_ALL, sql)
  }

  /** Apply the vertical's payload policy. Identity when nothing changes. */
  private strip<T>(vertical: string, record: T): T {
    return stripRawPayload(vertical, record, this.rawPayloadEnabled(vertical))
  }

  /**
   * Expose the underlying handle so the sibling SyncStore (and the data-store
   * metrics route) share the same connection without re-opening the backend.
   */
  getHandle(): DbHandle {
    return this.handle
  }

  private pk(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
  ): string {
    return `${vertical}:${platform}:${tenantId ?? ''}:${resourceType}:${resourceId}`
  }

  async get<T>(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
    options?: ReadOptions,
  ): Promise<T | null> {
    const row = await this.getWithMeta<T>(
      vertical,
      platform,
      tenantId,
      resourceType,
      resourceId,
      options,
    )
    return row ? row.data : null
  }

  /**
   * `get` plus the row's `updated_at` — the write time the router layer
   * surfaces as `X-OpenSteward-Synced-At` so a caller can tell how old a
   * cache hit actually is.
   */
  async getWithMeta<T>(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
    options?: ReadOptions,
  ): Promise<{ data: T; updatedAt: number } | null> {
    const row = (await this.handle.kysely
      .selectFrom('resources')
      .select(['data', 'updated_at', 'norm_version'])
      .where('pk', '=', this.pk(vertical, platform, tenantId, resourceType, resourceId))
      .executeTakeFirst()) as (ResourceRow & { norm_version: string | null }) | undefined
    if (!row) return null
    // A row written by a different normalizer is the wrong SHAPE, not merely
    // old data — serving it hands the caller a record from a previous build.
    if (options?.normVersion !== undefined && row.norm_version !== options.normVersion) {
      return null
    }
    if (options?.maxAgeMs !== undefined && Date.now() - row.updated_at > options.maxAgeMs) {
      return null
    }
    return { data: this.strip(vertical, JSON.parse(row.data) as T), updatedAt: row.updated_at }
  }

  async list<T>(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    options?: ReadOptions,
  ): Promise<T[]> {
    const res = await this.listWithMeta<T>(vertical, platform, tenantId, resourceType, options)
    return res.data
  }

  /**
   * `list` plus the newest row's `updated_at` (null when empty) — see
   * `getWithMeta`. The newest write time is the honest "synced at" for a
   * whole-collection read: anything older is by definition staler.
   */
  async listWithMeta<T>(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    options?: ReadOptions,
  ): Promise<{ data: T[]; updatedAt: number | null }> {
    // SQLite's `tenant_id IS ?` null-safe equality has no portable operator
    // form, so build the nullable clause conditionally: a null tenant matches
    // NULL rows (`IS NULL`), a value matches by `=`.
    const tenantVal = tenantId ?? null
    let q = this.handle.kysely
      .selectFrom('resources')
      .select(['resource_id', 'data', 'updated_at'])
      .where('vertical', '=', vertical)
      .where('platform', '=', platform)
    q = tenantVal == null ? q.where('tenant_id', 'is', null) : q.where('tenant_id', '=', tenantVal)
    if (options?.normVersion !== undefined) {
      q = q.where('norm_version', '=', options.normVersion)
    }
    const rows = (await q
      .where('resource_type', '=', resourceType)
      .orderBy('updated_at', 'desc')
      .execute()) as ResourceListRow[]
    if (rows.length === 0) return { data: [], updatedAt: null }
    if (options?.maxAgeMs !== undefined) {
      const cutoff = Date.now() - options.maxAgeMs
      // ORDER BY updated_at DESC means we just check the oldest row.
      const oldest = rows[rows.length - 1]!
      if (oldest.updated_at < cutoff) return { data: [], updatedAt: null }
    }
    return {
      data: rows.map((r) => this.strip(vertical, JSON.parse(r.data) as T)),
      updatedAt: rows[0]!.updated_at,
    }
  }

  async upsert(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
    data: unknown,
    normVersion?: string,
  ): Promise<void> {
    const now = Date.now()
    const json = JSON.stringify(this.strip(vertical, data))
    await this.writeRow(this.handle.kysely, {
      vertical,
      platform,
      tenantId,
      resourceType,
      resourceId,
      json,
      now,
      normVersion,
    })
  }

  /**
   * One INSERT … ON CONFLICT for `upsert` / `upsertMany`.
   *
   * `updated_at` is stamped on every write (sweepCollection depends on it).
   * `changed_at` moves only when the stored JSON differs from the previous
   * write — by `data_hash`, or, for a row written before hashes existed, by
   * the JSON itself. SET expressions read the EXISTING row on both SQLite and
   * Postgres, so `resources.*` below is the previous write.
   */
  private async writeRow(
    db: KyselyDb,
    row: {
      vertical: string
      platform: string
      tenantId: string | null | undefined
      resourceType: string
      resourceId: string
      json: string
      now: number
      normVersion: string | undefined
    },
  ): Promise<void> {
    const hash = createHash('sha256').update(row.json).digest('hex')
    await db
      .insertInto('resources')
      .values({
        pk: this.pk(row.vertical, row.platform, row.tenantId, row.resourceType, row.resourceId),
        vertical: row.vertical,
        platform: row.platform,
        tenant_id: row.tenantId ?? null,
        resource_type: row.resourceType,
        resource_id: row.resourceId,
        data: row.json,
        fetched_at: row.now,
        updated_at: row.now,
        changed_at: row.now,
        data_hash: hash,
        norm_version: row.normVersion ?? null,
      })
      .onConflict((oc) =>
        oc.column('pk').doUpdateSet((eb) => ({
          data: eb.ref('excluded.data'),
          updated_at: eb.ref('excluded.updated_at'),
          norm_version: eb.ref('excluded.norm_version'),
          data_hash: eb.ref('excluded.data_hash'),
          changed_at: eb
            .case()
            .when(
              eb.or([
                eb('resources.data_hash', '=', eb.ref('excluded.data_hash')),
                eb.and([
                  eb('resources.data_hash', 'is', null),
                  eb('resources.data', '=', eb.ref('excluded.data')),
                ]),
              ]),
            )
            .then(eb.fn.coalesce('resources.changed_at', 'resources.updated_at'))
            .else(eb.ref('excluded.changed_at'))
            .end(),
        })),
      )
      .execute()
  }

  private collectionPk(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
  ): string {
    return `${vertical}:${platform}:${tenantId ?? ''}:${resourceType}`
  }

  /**
   * Record that the WHOLE collection was written. Only callers that can prove
   * it — an unfiltered fetch that reached the last page, or a completed sync
   * job — may call this.
   */
  async markCollectionComplete(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    normVersion?: string,
  ): Promise<void> {
    const now = Date.now()
    await this.handle.kysely
      .insertInto('collection_sync')
      .values({
        pk: this.collectionPk(vertical, platform, tenantId, resourceType),
        vertical,
        platform,
        tenant_id: tenantId ?? null,
        resource_type: resourceType,
        synced_at: now,
        norm_version: normVersion ?? null,
      })
      .onConflict((oc) =>
        oc.column('pk').doUpdateSet({ synced_at: now, norm_version: normVersion ?? null }),
      )
      .execute()
  }

  /** When the whole collection was last written, or null if never. */
  async collectionCompletedAt(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    normVersion?: string,
  ): Promise<number | null> {
    const row = (await this.handle.kysely
      .selectFrom('collection_sync')
      .select(['synced_at', 'norm_version'])
      .where('pk', '=', this.collectionPk(vertical, platform, tenantId, resourceType))
      .executeTakeFirst()) as { synced_at: number; norm_version: string | null } | undefined
    if (!row) return null
    if (normVersion !== undefined && row.norm_version !== normVersion) return null
    return row.synced_at
  }

  /** Drop the completeness marker — any mutation makes the cached collection
   *  wrong, so the next list must go upstream. */
  async invalidateCollection(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
  ): Promise<void> {
    await this.handle.kysely
      .deleteFrom('collection_sync')
      .where('pk', '=', this.collectionPk(vertical, platform, tenantId, resourceType))
      .execute()
  }

  /**
   * Remove the rows of exactly one collection written before `writtenBefore`
   * (STRICT `<`, epoch ms — the `updated_at` every write stamps), and return
   * their resource ids.
   *
   * For a full sync that reached a KNOWN end: every row it wrote, or re-wrote
   * unchanged (`upsertMany` re-stamps on conflict), is at least as new as the
   * moment it started, so anything older is a row the platform no longer
   * returns. The caller owns that proof — this only deletes. It emits nothing.
   *
   * A null/undefined tenant matches only NULL-tenant rows, as in `list`.
   */
  async sweepCollection(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    writtenBefore: number,
  ): Promise<string[]> {
    const tenantVal = tenantId ?? null
    return this.handle.transaction(async (tx) => {
      let q = tx
        .deleteFrom('resources')
        .where('vertical', '=', vertical)
        .where('platform', '=', platform)
      q =
        tenantVal == null ? q.where('tenant_id', 'is', null) : q.where('tenant_id', '=', tenantVal)
      // DELETE … RETURNING is portable here: Postgres, and SQLite since 3.35.
      const rows = (await q
        .where('resource_type', '=', resourceType)
        .where('updated_at', '<', writtenBefore)
        .returning('resource_id')
        .execute()) as Array<{ resource_id: string }>
      const ids = rows.map((r) => r.resource_id)
      await this.writeTombstones(
        tx,
        ids.map((id) => ({
          vertical,
          platform,
          connectionId: tenantVal,
          resourceType,
          resourceId: id,
        })),
      )
      return ids
    })
  }

  /**
   * Returns the write time stamped on every row (`updated_at`, and
   * `fetched_at` on insert) — the time it would have stamped when `items` is
   * empty. A conflicting row is re-stamped even when its data is unchanged,
   * which `sweepCollection` relies on; its `changed_at` is not.
   */
  async upsertMany(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    items: Array<{ id: string }>,
    normVersion?: string,
  ): Promise<number> {
    const now = Date.now()
    if (items.length === 0) return now
    await this.handle.transaction(async (tx) => {
      for (const item of items) {
        const json = JSON.stringify(this.strip(vertical, item))
        await this.writeRow(tx, {
          vertical,
          platform,
          tenantId,
          resourceType,
          resourceId: item.id,
          json,
          now,
          normVersion,
        })
      }
    })
    return now
  }

  async delete(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    await this.handle.transaction(async (tx) => {
      const res = await tx
        .deleteFrom('resources')
        .where('pk', '=', this.pk(vertical, platform, tenantId, resourceType, resourceId))
        .executeTakeFirst()
      if (Number(res.numDeletedRows ?? 0) === 0) return
      await this.writeTombstones(tx, [
        { vertical, platform, connectionId: tenantId ?? null, resourceType, resourceId },
      ])
    })
  }

  /**
   * Record deletions for the change feed. NULL columns widen the scope — see
   * migration 5. Chunked so a large sweep stays under SQLite's bound-variable
   * limit.
   */
  private async writeTombstones(
    db: KyselyDb,
    rows: Array<{
      vertical: string | null
      platform: string | null
      connectionId: string | null
      resourceType: string | null
      resourceId: string | null
    }>,
  ): Promise<void> {
    if (rows.length === 0) return
    const now = Date.now()
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insertInto('resource_tombstones')
        .values(
          rows.slice(i, i + 500).map((r) => ({
            vertical: r.vertical,
            platform: r.platform,
            connection_id: r.connectionId,
            resource_type: r.resourceType,
            resource_id: r.resourceId,
            deleted_at: now,
          })),
        )
        .execute()
    }
  }

  /**
   * Drop every cached row, or every row for one vertical.
   *
   * Reads are already filtered by the raw-payload policy, so an operator who
   * turns a flag off is protected immediately. This is for actually removing
   * the bytes from disk — which is what a breach review or an erasure request
   * asks about, and what read-time filtering cannot do.
   *
   * Returns the number of rows removed.
   *
   * The completeness markers go with the rows, as in `deleteConnection`.
   */
  async deleteAll(vertical?: string): Promise<number> {
    return this.handle.transaction(async (tx) => {
      let markers = tx.deleteFrom('collection_sync')
      if (vertical) markers = markers.where('vertical', '=', vertical)
      await markers.execute()
      let q = tx.deleteFrom('resources')
      if (vertical) q = q.where('vertical', '=', vertical)
      const res = await q.executeTakeFirst()
      const removed = Number(res.numDeletedRows ?? 0)
      if (removed > 0) {
        await this.writeTombstones(tx, [
          {
            vertical: vertical ?? null,
            platform: null,
            connectionId: null,
            resourceType: null,
            resourceId: null,
          },
        ])
      }
      return removed
    })
  }

  /**
   * Remove every row for one (vertical, platform, connection) — on connection
   * delete, and on an operator's cache-clear — and its completeness markers
   * with them.
   *
   * A marker left standing over the emptied collection would vouch for
   * whatever is written next: one `cachedGet` stores one record, and an
   * unfiltered list then serves that record as the whole collection — the
   * "row presence is not completeness" defect the marker exists to prevent.
   * One transaction, so no reader sees the marker without the rows.
   */
  async deleteConnection(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
  ): Promise<void> {
    // Same null-safe tenant clause as `list` — `tenant_id IS ?` is not a
    // portable operator, so branch on null vs value.
    const tenantVal = tenantId ?? null
    await this.handle.transaction(async (tx) => {
      let markers = tx
        .deleteFrom('collection_sync')
        .where('vertical', '=', vertical)
        .where('platform', '=', platform)
      markers =
        tenantVal == null
          ? markers.where('tenant_id', 'is', null)
          : markers.where('tenant_id', '=', tenantVal)
      await markers.execute()
      let q = tx
        .deleteFrom('resources')
        .where('vertical', '=', vertical)
        .where('platform', '=', platform)
      q =
        tenantVal == null ? q.where('tenant_id', 'is', null) : q.where('tenant_id', '=', tenantVal)
      const res = await q.executeTakeFirst()
      if (Number(res.numDeletedRows ?? 0) > 0) {
        await this.writeTombstones(tx, [
          { vertical, platform, connectionId: tenantVal, resourceType: null, resourceId: null },
        ])
      }
    })
  }

  // ── Browse / change feed ───────────────────────────────────────────────

  private toStored<T>(r: StoredRow): StoredResource<T> {
    return {
      resourceId: r.resource_id,
      resourceType: r.resource_type,
      vertical: r.vertical,
      platform: r.platform,
      connectionId: r.tenant_id,
      data: this.strip(r.vertical, JSON.parse(r.data) as T),
      fetchedAt: Number(r.fetched_at),
      updatedAt: Number(r.updated_at),
      changedAt: Number(r.changed_at),
      normVersion: r.norm_version,
    }
  }

  /** The dialect's JSON-path operand for a validated dotted path. */
  private jsonPath(path: string): {
    text: RawBuilder<unknown>
    num: RawBuilder<unknown>
    raw: RawBuilder<unknown>
  } {
    if (!isValidDataPath(path)) {
      throw new ResourcePageError('INVALID_PATH', `Invalid field path '${path}'.`)
    }
    const sql = this.sql
    if (this.handle.dialect === 'postgres') {
      const arr = `{${path.split('.').join(',')}}`
      return {
        raw: sql`(data::jsonb #>> ${arr}::text[])`,
        text: sql`(data::jsonb #>> ${arr}::text[])`,
        num: sql`(CASE WHEN jsonb_typeof(data::jsonb #> ${arr}::text[]) = 'number' THEN (data::jsonb #>> ${arr}::text[])::numeric END)`,
      }
    }
    const jp = `$.${path}`
    return {
      raw: sql`json_extract(data, ${jp})`,
      text: sql`(CASE json_type(data, ${jp}) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST(json_extract(data, ${jp}) AS TEXT) END)`,
      num: sql`(CASE WHEN json_type(data, ${jp}) IN ('integer', 'real') THEN json_extract(data, ${jp}) END)`,
    }
  }

  /** Case-insensitive substring match, LIKE wildcards in `needle` escaped. */
  private containsExpr(operand: RawBuilder<unknown>, needle: string): RawBuilder<unknown> {
    const pattern = `%${escapeLike(needle)}%`
    return this.handle.dialect === 'postgres'
      ? this.sql`${operand} ILIKE ${pattern} ESCAPE '\\'`
      : this.sql`${operand} LIKE ${pattern} ESCAPE '\\'`
  }

  private filterExpr(f: PageFilter): RawBuilder<unknown> {
    const sql = this.sql
    const p = this.jsonPath(f.path)
    const v = f.value
    switch (f.op) {
      case 'is_null':
        return sql`${p.raw} IS NULL`
      case 'eq':
        if (v === null || v === undefined) return sql`${p.raw} IS NULL`
        if (typeof v === 'number') return sql`${p.num} = ${v}`
        return sql`${p.text} = ${String(v)}`
      case 'contains':
        if (v === null || v === undefined || v === '') {
          throw new ResourcePageError('INVALID_FILTER', `Filter '${f.path}' needs a value.`)
        }
        return this.containsExpr(p.text, String(v))
      case 'gt':
      case 'lt': {
        if (v === null || v === undefined) {
          throw new ResourcePageError('INVALID_FILTER', `Filter '${f.path}' needs a value.`)
        }
        const operand = typeof v === 'number' ? p.num : p.text
        const val = typeof v === 'number' ? v : String(v)
        return f.op === 'gt' ? sql`${operand} > ${val}` : sql`${operand} < ${val}`
      }
      default:
        throw new ResourcePageError('INVALID_FILTER', `Unknown filter op '${String(f.op)}'.`)
    }
  }

  /** One stored record with its row metadata (the data viewer's detail read). */
  async getRecord<T = unknown>(
    vertical: string,
    platform: string,
    tenantId: string | null | undefined,
    resourceType: string,
    resourceId: string,
  ): Promise<StoredResource<T> | null> {
    const row = (await this.handle.kysely
      .selectFrom('resources')
      .select([
        'pk',
        'vertical',
        'platform',
        'tenant_id',
        'resource_type',
        'resource_id',
        'data',
        'fetched_at',
        'updated_at',
        'norm_version',
      ])
      .select((eb) => eb.fn.coalesce('changed_at', 'updated_at').as('changed_at'))
      .where('pk', '=', this.pk(vertical, platform, tenantId, resourceType, resourceId))
      .executeTakeFirst()) as StoredRow | undefined
    return row ? this.toStored<T>(row) : null
  }

  /**
   * One page of stored records for a set of connections, keyset-paginated on
   * (sort column, pk) — stable under concurrent writes, and O(page) at any
   * depth where OFFSET is O(depth).
   *
   * Paths are validated and bound as parameters; the caller decides which
   * paths a reader may filter on (see `isSearchable` in data-classification).
   * `stripRawPayload` applies to every returned record, as on every read.
   */
  async page<T = unknown>(opts: PageOptions): Promise<ResourcePage<T>> {
    const sort: PageSort = opts.sort === 'resource_id' ? 'resource_id' : 'updated_at'
    const dir: PageDir = opts.dir === 'asc' ? 'asc' : 'desc'
    const limit = Math.max(1, Math.min(PAGE_MAX_LIMIT, Math.floor(opts.limit ?? 50)))
    const order = `${sort}:${dir}`
    if (opts.connectionIds.length === 0) {
      return { items: [], nextCursor: null, total: 0, totalCapped: false }
    }
    const cursor = opts.cursor ? decodeCursor(opts.cursor, order) : null
    // Build filter expressions first so an invalid path fails before any query.
    const filterExprs = (opts.filters ?? []).map((f) => this.filterExpr(f))
    const q = opts.q?.trim()
    const searchExprs = q
      ? [
          this.containsExpr(this.sql`resource_id`, q),
          ...(opts.searchPaths ?? []).map((path) => this.containsExpr(this.jsonPath(path).text, q)),
        ]
      : []

    let base = this.handle.kysely
      .selectFrom('resources')
      .where('tenant_id', 'in', opts.connectionIds)
      .where('resource_type', '=', opts.resourceType)
    if (opts.vertical) base = base.where('vertical', '=', opts.vertical)
    for (const e of filterExprs) base = base.where(e as RawBuilder<boolean>)
    if (searchExprs.length > 0) {
      base = base.where((eb) => eb.or(searchExprs as Array<RawBuilder<boolean>>))
    }

    const countRow = (await this.handle.kysely
      .selectFrom(
        base
          .select('pk')
          .limit(PAGE_COUNT_CAP + 1)
          .as('capped'),
      )
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow()) as { n: number | string | bigint }
    const total = Number(countRow.n)

    let pageQ = base.select([
      'pk',
      'vertical',
      'platform',
      'tenant_id',
      'resource_type',
      'resource_id',
      'data',
      'fetched_at',
      'updated_at',
      'norm_version',
    ])
    pageQ = pageQ.select((eb) => eb.fn.coalesce('changed_at', 'updated_at').as('changed_at'))
    if (cursor) {
      const cmp = dir === 'asc' ? '>' : '<'
      pageQ = pageQ.where((eb) =>
        eb.or([
          eb(sort, cmp, cursor.s),
          eb.and([eb(sort, '=', cursor.s), eb('pk', cmp, cursor.k)]),
        ]),
      )
    }
    const rows = (await pageQ
      .orderBy(sort, dir)
      .orderBy('pk', dir)
      .limit(limit + 1)
      .execute()) as StoredRow[]
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows[pageRows.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            v: 1,
            o: order,
            s: sort === 'updated_at' ? Number(last.updated_at) : last.resource_id,
            k: last.pk,
          })
        : null
    return {
      items: pageRows.map((r) => this.toStored<T>(r)),
      nextCursor,
      total,
      totalCapped: total > PAGE_COUNT_CAP,
    }
  }

  /**
   * Rows whose DATA changed after a watermark, oldest first, ordered by
   * (changed_at, pk). Rows changed within `lagMs` of now are held back so a
   * write that commits late cannot land behind a reader's watermark.
   */
  async changesSince<T = unknown>(opts: ChangesSinceOptions): Promise<ChangeBatch<T>> {
    const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 500)))
    const horizon = Date.now() - (opts.lagMs ?? CHANGES_DEFAULT_LAG_MS)
    if (opts.connectionIds && opts.connectionIds.length === 0) return { items: [], next: null }
    let q = this.handle.kysely
      .selectFrom('resources')
      .select([
        'pk',
        'vertical',
        'platform',
        'tenant_id',
        'resource_type',
        'resource_id',
        'data',
        'fetched_at',
        'updated_at',
        'norm_version',
      ])
      .select((eb) => eb.fn.coalesce('changed_at', 'updated_at').as('changed_at'))
      .where('vertical', '=', opts.vertical)
      .where('resource_type', '=', opts.resourceType)
      .where((eb) => eb(eb.fn.coalesce('changed_at', 'updated_at'), '<=', horizon))
    if (opts.connectionIds) q = q.where('tenant_id', 'in', opts.connectionIds)
    if (opts.afterChangedAt !== undefined) {
      const after = opts.afterChangedAt
      const afterPk = opts.afterPk ?? ''
      q = q.where((eb) => {
        const changed = eb.fn.coalesce('changed_at', 'updated_at')
        return eb.or([
          eb(changed, '>', after),
          eb.and([eb(changed, '=', after), eb('pk', '>', afterPk)]),
        ])
      })
    }
    const rows = (await q
      .orderBy((eb) => eb.fn.coalesce('changed_at', 'updated_at'), 'asc')
      .orderBy('pk', 'asc')
      .limit(limit)
      .execute()) as StoredRow[]
    const items = rows.map((r) => ({ ...this.toStored<T>(r), pk: r.pk }))
    const last = rows[rows.length - 1]
    return {
      items,
      next: last ? { afterChangedAt: Number(last.changed_at), afterPk: last.pk } : null,
    }
  }

  /** Deletions after a tombstone id, oldest first. */
  async tombstonesSince(afterId: number, limit = 500): Promise<Tombstone[]> {
    const rows = (await this.handle.kysely
      .selectFrom('resource_tombstones')
      .selectAll()
      .where('id', '>', afterId)
      .orderBy('id', 'asc')
      .limit(Math.max(1, Math.min(1000, Math.floor(limit))))
      .execute()) as Array<{
      id: number
      vertical: string | null
      platform: string | null
      connection_id: string | null
      resource_type: string | null
      resource_id: string | null
      deleted_at: number
    }>
    return rows.map((r) => ({
      id: Number(r.id),
      vertical: r.vertical,
      platform: r.platform,
      connectionId: r.connection_id,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      deletedAt: Number(r.deleted_at),
    }))
  }

  /**
   * The newest tombstone id, or 0 when there are none. A new change-feed
   * reader starts its delete watermark here: every older deletion removed a
   * row it can never have seen.
   */
  async latestTombstoneId(): Promise<number> {
    const row = (await this.handle.kysely
      .selectFrom('resource_tombstones')
      .select((eb) => eb.fn.max('id').as('id'))
      .executeTakeFirst()) as { id: number | string | null } | undefined
    return row?.id == null ? 0 : Number(row.id)
  }

  /**
   * Count / sum stored records for a set of connections, optionally bucketed
   * by the day of a date field and grouped by a field's value. Built on the
   * same per-dialect JSON extraction `page()` filters with, so a path means
   * the same thing in both. The extraction happens in a subquery and the
   * grouping on its aliases: Postgres cannot match a `GROUP BY` expression to
   * a select-list one when each carries its own bound parameter.
   */
  async aggregate(opts: AggregateOptions): Promise<AggregateRow[]> {
    if (opts.connectionIds.length === 0) return []
    for (const d of [opts.from, opts.to]) {
      if (d !== undefined && !DAY_RE.test(d)) {
        throw new ResourcePageError('INVALID_FILTER', `Invalid day '${d}'; expected YYYY-MM-DD.`)
      }
    }
    if (opts.byDay && !opts.dateField) {
      throw new ResourcePageError('INVALID_FILTER', 'Bucketing by day needs a date field.')
    }
    const sql = this.sql
    const date = opts.dateField ? this.jsonPath(opts.dateField) : null
    const day = date ? sql`substr(${date.text}, 1, 10)` : null
    const dayCol = opts.byDay && day ? day : sql`CAST(NULL AS TEXT)`
    const groupCol = opts.groupField ? this.jsonPath(opts.groupField).text : sql`CAST(NULL AS TEXT)`
    const numCol = opts.sumField ? this.jsonPath(opts.sumField).num : sql`CAST(NULL AS NUMERIC)`

    const where: Array<RawBuilder<unknown>> = [
      sql`tenant_id IN (${sql.join([...opts.connectionIds])})`,
      sql`resource_type = ${opts.resourceType}`,
    ]
    if (opts.vertical) where.push(sql`vertical = ${opts.vertical}`)
    if (date && day) {
      where.push(sql`${date.text} LIKE ${'____-__-__%'}`)
      if (opts.from) where.push(sql`${day} >= ${opts.from}`)
      if (opts.to) where.push(sql`${day} <= ${opts.to}`)
    }

    const inner = sql`SELECT ${dayCol} AS day, ${groupCol} AS grp, ${numCol} AS num FROM resources WHERE ${sql.join(where, sql` AND `)}`
    const result = await sql<{
      day: string | null
      grp: string | null
      n: number | string | bigint
      s: number | string | null
    }>`SELECT day, grp, COUNT(*) AS n, SUM(num) AS s FROM (${inner}) agg GROUP BY day, grp ORDER BY day, grp`.execute(
      this.handle.kysely,
    )
    return result.rows.map((r) => ({
      day: r.day ?? null,
      group: r.grp ?? null,
      count: Number(r.n),
      sum: r.s === null || r.s === undefined ? null : Number(r.s),
    }))
  }

  // ── Metric queries ──────────────────────────────────────────────────────

  /** `substr(text, 1, 10)` of a path, only when the text starts `YYYY-MM-DD`. */
  private dayOf(path: string): RawBuilder<unknown> {
    const t = this.jsonPath(path).text
    return this.sql`(CASE WHEN ${t} LIKE ${'____-__-__%'} THEN substr(${t}, 1, 10) END)`
  }

  private metricFilterExpr(f: MetricStoreFilter, today: string): RawBuilder<unknown> {
    const sql = this.sql
    const p = this.jsonPath(f.path)
    const v = f.value
    const list = (): Array<string | number> => {
      if (!Array.isArray(v) || v.length === 0) {
        throw new ResourcePageError('INVALID_FILTER', `Filter '${f.path}' ${f.op} needs a list.`)
      }
      return v as Array<string | number>
    }
    const inExpr = (values: Array<string | number>): RawBuilder<unknown> =>
      values.every((x) => typeof x === 'number')
        ? sql`${p.num} IN (${sql.join(values)})`
        : sql`${p.text} IN (${sql.join(values.map(String))})`
    const eqExpr = (): RawBuilder<unknown> => {
      if (v === null || v === undefined) return sql`${p.raw} IS NULL`
      if (typeof v === 'number') return sql`${p.num} = ${v}`
      if (Array.isArray(v)) {
        throw new ResourcePageError('INVALID_FILTER', `Filter '${f.path}' eq takes one value.`)
      }
      return sql`${p.text} = ${String(v)}`
    }
    const day = this.dayOf(f.path)
    switch (f.op) {
      case 'eq':
        return eqExpr()
      case 'ne':
        return sql`(${p.raw} IS NULL OR NOT COALESCE(${eqExpr()}, FALSE))`
      case 'in':
        return inExpr(list())
      case 'not_in':
        return sql`(${p.raw} IS NULL OR NOT COALESCE(${inExpr(list())}, FALSE))`
      case 'in_ci':
        return sql`LOWER(${p.text}) IN (${sql.join(list().map((x) => String(x).toLowerCase()))})`
      case 'is_null':
        return sql`${p.raw} IS NULL`
      case 'not_null':
        return sql`${p.raw} IS NOT NULL`
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (typeof v === 'number') return sql`${p.num} ${sql.raw(SQL_CMP[f.op])} ${v}`
        if (typeof v === 'string') return sql`${p.text} ${sql.raw(SQL_CMP[f.op])} ${v}`
        throw new ResourcePageError(
          'INVALID_FILTER',
          `Filter '${f.path}' ${f.op} needs a number or a string.`,
        )
      }
      case 'before_now':
        return sql`${day} < ${today}`
      case 'after_now':
        return sql`${day} >= ${today}`
      case 'older_than_days':
        return sql`${day} < ${shiftDay(today, -daysValue(f))}`
      case 'within_last_days':
        return sql`(${day} >= ${shiftDay(today, -daysValue(f))} AND ${day} <= ${today})`
      case 'within_next_days':
        return sql`(${day} >= ${today} AND ${day} <= ${shiftDay(today, daysValue(f))})`
      default:
        throw new ResourcePageError('INVALID_FILTER', `Unknown filter op '${String(f.op)}'.`)
    }
  }

  private compareExpr(c: MetricStoreCompare): RawBuilder<unknown> {
    const sql = this.sql
    if (!Object.hasOwn(SQL_CMP, c.op)) {
      throw new ResourcePageError('INVALID_FILTER', `Unknown comparison '${String(c.op)}'.`)
    }
    const op = sql.raw(SQL_CMP[c.op])
    const l = this.jsonPath(c.left)
    const r = this.jsonPath(c.right)
    const ld = this.dayOf(c.left)
    const rd = this.dayOf(c.right)
    return sql`((${l.num} IS NOT NULL AND ${r.num} IS NOT NULL AND ${l.num} ${op} ${r.num}) OR (${l.num} IS NULL AND ${r.num} IS NULL AND ${ld} IS NOT NULL AND ${rd} IS NOT NULL AND ${ld} ${op} ${rd}))`
  }

  /**
   * SQLite: the text starts with a real calendar day (years 0001–9999).
   * SQLite's date functions accept `2026-02-30` (rolling it into March) and
   * year 0, so a round trip through `date()` is what rejects them — the same
   * days `PG_DATE` accepts.
   */
  private sqliteDateOk(t: RawBuilder<unknown>): RawBuilder<unknown> {
    const sql = this.sql
    return sql`(substr(${t}, 1, 4) <> '0000' AND date(substr(${t}, 1, 10)) = substr(${t}, 1, 10))`
  }

  /**
   * SQLite: a real day, a time, and an offset of at most ±14:00 — measured
   * as local wall time minus the instant SQLite computes (`julianday` is
   * NULL for text it cannot parse, including offsets it refuses).
   */
  private sqliteInstantOk(t: RawBuilder<unknown>): RawBuilder<unknown> {
    const sql = this.sql
    const local = sql`substr(${t}, 1, 10) || ' ' || substr(${t}, 12, CASE WHEN substr(${t}, 17, 1) = ':' THEN 8 ELSE 5 END)`
    return sql`(${this.sqliteDateOk(t)} AND substr(${t}, 11, 1) IN ('T', ' ') AND julianday(${t}) IS NOT NULL AND abs(julianday(${local}) - julianday(${t})) * 1440 <= ${MAX_OFFSET_MINUTES})`
  }

  /** ISO weekday (1 = Monday) of a date path, in UTC, as text; NULL for an impossible value. */
  private weekdayExpr(path: string): RawBuilder<unknown> {
    const sql = this.sql
    const t = this.jsonPath(path).text
    if (this.handle.dialect === 'postgres') {
      return sql`(CASE WHEN ${t} ~ ${PG_DATETIME_OFFSET_RE} THEN CAST(CAST(EXTRACT(ISODOW FROM (CAST(${t} AS timestamptz) AT TIME ZONE 'UTC')) AS INTEGER) AS TEXT) WHEN ${t} ~ ${PG_DATETIME_LOCAL_RE} THEN CAST(CAST(EXTRACT(ISODOW FROM CAST(${t} AS timestamp)) AS INTEGER) AS TEXT) WHEN ${t} ~ ${PG_DATE_ONLY_RE} THEN CAST(CAST(EXTRACT(ISODOW FROM CAST(${t} AS date)) AS INTEGER) AS TEXT) END)`
    }
    // strftime applies a stored offset (UTC result); %w is 0 = Sunday, so
    // shift to ISO 1 = Monday … 7.
    const iso = sql`CAST(((CAST(strftime('%w', ${t}) AS INTEGER) + 6) % 7) + 1 AS TEXT)`
    return sql`(CASE WHEN length(${t}) = 10 AND ${this.sqliteDateOk(t)} THEN ${iso} WHEN length(${t}) > 10 AND ${this.sqliteInstantOk(t)} THEN ${iso} END)`
  }

  /** Hour `00`–`23` of a datetime path, in UTC; null for a bare calendar date or an impossible value. */
  private hourExpr(path: string): RawBuilder<unknown> {
    const sql = this.sql
    const t = this.jsonPath(path).text
    if (this.handle.dialect === 'postgres') {
      return sql`(CASE WHEN ${t} ~ ${PG_DATETIME_OFFSET_RE} THEN to_char(CAST(${t} AS timestamptz) AT TIME ZONE 'UTC', 'HH24') WHEN ${t} ~ ${PG_DATETIME_LOCAL_RE} THEN to_char(CAST(${t} AS timestamp), 'HH24') END)`
    }
    return sql`(CASE WHEN length(${t}) > 10 AND ${this.sqliteInstantOk(t)} THEN strftime('%H', ${t}) END)`
  }

  /** ISO week `YYYY-Www` of the stored day (the offset plays no part); NULL for an impossible day. */
  private weekExpr(path: string): RawBuilder<unknown> {
    const sql = this.sql
    const t = this.jsonPath(path).text
    if (this.handle.dialect === 'postgres') {
      return sql`(CASE WHEN ${t} ~ ${PG_DATE_PREFIX_RE} THEN to_char(CAST(substr(${t}, 1, 10) AS date), 'IYYY-"W"IW') END)`
    }
    return sql`(CASE WHEN ${t} LIKE ${'____-__-__%'} AND ${this.sqliteDateOk(t)} THEN strftime('%G-W%V', substr(${t}, 1, 10)) END)`
  }

  private dimensionExpr(
    d: AggregateDimension,
    today: string,
    unnestValue: RawBuilder<unknown> | null,
  ): RawBuilder<unknown> {
    const sql = this.sql
    switch (d.type) {
      case 'field':
        if (d.unnest) {
          if (!unnestValue) throw new ResourcePageError('INVALID_FILTER', 'Unnest is not set up.')
          return unnestValue
        }
        return this.jsonPath(d.path).text
      case 'date': {
        const t = this.jsonPath(d.path).text
        switch (d.unit) {
          case 'day':
            return this.dayOf(d.path)
          case 'month':
            return sql`(CASE WHEN ${t} LIKE ${'____-__-__%'} THEN substr(${t}, 1, 7) END)`
          case 'week':
            return this.weekExpr(d.path)
          case 'weekday':
            return this.weekdayExpr(d.path)
          case 'hour':
            return this.hourExpr(d.path)
          default:
            throw new ResourcePageError(
              'INVALID_FILTER',
              `Unknown date bucket '${String(d.unit)}'.`,
            )
        }
      }
      case 'band': {
        assertEdges(d.edges, 'Band')
        const num = this.jsonPath(d.path).num
        const whens = d.edges.map((e, i) => sql`WHEN ${num} < ${e} THEN ${sql.lit(i)}`)
        return sql`CAST((CASE WHEN ${num} IS NULL THEN NULL ${sql.join(whens, sql` `)} ELSE ${sql.lit(d.edges.length)} END) AS TEXT)`
      }
      case 'age': {
        assertEdges(d.edges, 'Age')
        if (d.edges.some((e) => !Number.isInteger(e))) {
          throw new ResourcePageError('INVALID_FILTER', 'Age edges must be whole days.')
        }
        const day = this.dayOf(d.path)
        const whens = d.edges.map((e, i) =>
          d.direction === 'past'
            ? sql`WHEN ${day} >= ${shiftDay(today, -e)} THEN ${sql.lit(i)}`
            : sql`WHEN ${day} <= ${shiftDay(today, e)} THEN ${sql.lit(i)}`,
        )
        return sql`CAST((CASE WHEN ${day} IS NULL THEN NULL ${sql.join(whens, sql` `)} ELSE ${sql.lit(d.edges.length)} END) AS TEXT)`
      }
      default:
        throw new ResourcePageError('INVALID_FILTER', 'Unknown dimension.')
    }
  }

  /**
   * FROM + WHERE for a metric query. Every path is validated by `jsonPath`
   * and every value bound; the only spliced text is `SQL_CMP` operators and
   * integer literals. An `unnest` dimension joins the array's elements
   * (`json_each` / `jsonb_array_elements`), string elements only.
   */
  private metricFrom(
    opts: MetricQueryBase,
    unnestPath: string | null,
  ): {
    from: RawBuilder<unknown>
    where: RawBuilder<unknown>
    unnestValue: RawBuilder<unknown> | null
    today: string
  } {
    const sql = this.sql
    for (const d of [opts.from, opts.to]) {
      if (d !== undefined && !DAY_RE.test(d)) {
        throw new ResourcePageError('INVALID_FILTER', `Invalid day '${d}'; expected YYYY-MM-DD.`)
      }
    }
    const today = (opts.now ?? new Date()).toISOString().slice(0, 10)
    const where: Array<RawBuilder<unknown>> = [
      sql`resources.tenant_id IN (${sql.join([...opts.connectionIds])})`,
      sql`resources.resource_type = ${opts.resourceType}`,
    ]
    if (opts.vertical) where.push(sql`resources.vertical = ${opts.vertical}`)
    if (opts.dateField) {
      const day = this.dayOf(opts.dateField)
      where.push(sql`${day} IS NOT NULL`)
      if (opts.from) where.push(sql`${day} >= ${opts.from}`)
      if (opts.to) where.push(sql`${day} <= ${opts.to}`)
    }
    for (const f of opts.filters ?? []) where.push(this.metricFilterExpr(f, today))
    for (const c of opts.compare ?? []) where.push(this.compareExpr(c))

    let from = sql`resources`
    let unnestValue: RawBuilder<unknown> | null = null
    if (unnestPath !== null) {
      if (!isValidDataPath(unnestPath)) {
        throw new ResourcePageError('INVALID_PATH', `Invalid field path '${unnestPath}'.`)
      }
      if (this.handle.dialect === 'postgres') {
        const arr = `{${unnestPath.split('.').join(',')}}`
        from = sql`resources CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(resources.data::jsonb #> ${arr}::text[]) = 'array' THEN resources.data::jsonb #> ${arr}::text[] ELSE '[]'::jsonb END) AS ue(value)`
        where.push(sql`jsonb_typeof(ue.value) = 'string'`)
        unnestValue = sql`(ue.value #>> '{}')`
      } else {
        const jp = `$.${unnestPath}`
        from = sql`resources JOIN json_each(resources.data, ${jp}) AS ue`
        where.push(sql`json_type(resources.data, ${jp}) = 'array'`)
        where.push(sql`ue.type = 'text'`)
        unnestValue = sql`ue.value`
      }
    }
    return { from, where: sql.join(where, sql` AND `), unnestValue, today }
  }

  /**
   * The metric engine's aggregate: count, sum and average of stored records
   * for a set of connections, with row filters, field comparisons and up to
   * three grouping keys (see `AggregateDimension`). Keys are computed in a
   * subquery and grouped by alias, as in `aggregate` — Postgres cannot match
   * a `GROUP BY` expression to a select-list one that carries its own bound
   * parameters.
   */
  async aggregateV2(opts: AggregateV2Options): Promise<AggregateV2Row[]> {
    if (opts.connectionIds.length === 0) return []
    const dims = opts.dimensions ?? []
    if (dims.length > MAX_DIMENSIONS) {
      throw new ResourcePageError('INVALID_FILTER', `At most ${MAX_DIMENSIONS} dimensions.`)
    }
    const unnests = dims.filter((d) => d.type === 'field' && d.unnest)
    if (unnests.length > 1) {
      throw new ResourcePageError('INVALID_FILTER', 'At most one unnest dimension.')
    }
    const sql = this.sql
    const { from, where, unnestValue, today } = this.metricFrom(
      opts,
      unnests.length ? unnests[0]!.path : null,
    )
    const keyCols = dims.map(
      (d, i) => sql`${this.dimensionExpr(d, today, unnestValue)} AS ${sql.ref(`k${i}`)}`,
    )
    const numCol = opts.valueField ? this.jsonPath(opts.valueField).num : sql`CAST(NULL AS NUMERIC)`
    const inner = sql`SELECT ${sql.join([...keyCols, sql`${numCol} AS num`])} FROM ${from} WHERE ${where}`
    const keyRefs = dims.map((_, i) => sql.ref(`k${i}`))
    const groupBy = keyRefs.length
      ? sql` GROUP BY ${sql.join(keyRefs)} ORDER BY ${sql.join(keyRefs)}`
      : sql``
    const select = sql.join([
      ...keyRefs,
      sql`COUNT(*) AS n`,
      sql`SUM(num) AS s`,
      sql`COUNT(num) AS vn`,
    ])
    const result = await sql<
      Record<string, unknown>
    >`SELECT ${select} FROM (${inner}) agg${groupBy}`.execute(this.handle.kysely)
    return result.rows.map((r) => {
      const sum = r['s'] === null || r['s'] === undefined ? null : Number(r['s'])
      const valueCount = Number(r['vn'] ?? 0)
      return {
        keys: dims.map((_, i) => {
          const k = r[`k${i}`]
          return k === null || k === undefined ? null : String(k)
        }),
        count: Number(r['n']),
        sum,
        valueCount,
        avg: sum !== null && valueCount > 0 ? sum / valueCount : null,
      }
    })
  }

  /**
   * Raw values of matching records, for what SQL cannot aggregate portably —
   * date differences, percentiles. Bounded: above `limit` (at most
   * `FETCH_VALUES_CAP`) it returns every k-th row in pk order, a systematic
   * sample that is deterministic between calls, and says so (`sampled`).
   */
  async fetchValues(opts: FetchValuesOptions): Promise<FetchValuesResult> {
    if (opts.connectionIds.length === 0) return { rows: [], total: 0, sampled: false }
    if (opts.fields.length === 0) {
      throw new ResourcePageError('INVALID_FILTER', 'fetchValues needs at least one field.')
    }
    const cap = Math.max(1, Math.min(FETCH_VALUES_CAP, Math.floor(opts.limit ?? FETCH_VALUES_CAP)))
    const sql = this.sql
    const { from, where } = this.metricFrom(opts, null)
    const cols = opts.fields.map((f, i) => {
      const p = this.jsonPath(f.path)
      return sql`${f.as === 'number' ? p.num : p.text} AS ${sql.ref(`v${i}`)}`
    })
    const countRow = await sql<{
      n: number | string | bigint
    }>`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`.execute(this.handle.kysely)
    let total = Number(countRow.rows[0]?.n ?? 0)
    let sampled = total > cap
    let rows: Array<Record<string, unknown>>
    if (!sampled) {
      // LIMIT cap + 1: rows written between the count and this read can
      // never push the result past the cap.
      rows = (
        await sql<
          Record<string, unknown>
        >`SELECT ${sql.join(cols)} FROM ${from} WHERE ${where} ORDER BY resources.pk LIMIT ${cap + 1}`.execute(
          this.handle.kysely,
        )
      ).rows
      if (rows.length > cap) {
        rows = rows.slice(0, cap)
        total = Math.max(total, cap + 1)
        sampled = true
      }
    } else {
      // Every k-th pk is chosen first, over the filter alone; the value
      // columns are extracted for the chosen rows only.
      const stride = Math.ceil(total / cap)
      rows = (
        await sql<
          Record<string, unknown>
        >`SELECT ${sql.join(cols)} FROM resources WHERE resources.pk IN (SELECT s.pk FROM (SELECT resources.pk AS pk, ROW_NUMBER() OVER (ORDER BY resources.pk) AS rn FROM ${from} WHERE ${where}) s WHERE (s.rn - 1) % ${stride} = 0) ORDER BY resources.pk LIMIT ${cap}`.execute(
          this.handle.kysely,
        )
      ).rows
    }
    return {
      rows: rows.map((r) =>
        opts.fields.map((f, i) => {
          const v = r[`v${i}`]
          if (v === null || v === undefined) return null
          return f.as === 'number' ? Number(v) : String(v)
        }),
      ),
      total,
      sampled,
    }
  }

  /**
   * Display labels for ids, read from another resource type of the SAME
   * connections — one query per call (chunked for very long id lists). An id
   * with no stored record, or whose label is empty, is absent from the map;
   * when two connections disagree, the smallest label wins (stable).
   */
  async lookupLabels(opts: LookupLabelsOptions): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const keys = [...new Set(opts.keys)]
    if (opts.connectionIds.length === 0 || keys.length === 0) return out
    const sql = this.sql
    const key = this.jsonPath(opts.keyPath).text
    const label = this.jsonPath(opts.labelPath).text
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500)
      const where: Array<RawBuilder<unknown>> = [
        sql`tenant_id IN (${sql.join([...opts.connectionIds])})`,
        sql`resource_type = ${opts.resourceType}`,
        sql`${key} IN (${sql.join(chunk)})`,
      ]
      if (opts.vertical) where.push(sql`vertical = ${opts.vertical}`)
      const res = await sql<{
        k: string
        l: string | null
      }>`SELECT k, MIN(l) AS l FROM (SELECT ${key} AS k, ${label} AS l FROM resources WHERE ${sql.join(where, sql` AND `)}) s WHERE l IS NOT NULL AND l <> '' GROUP BY k`.execute(
        this.handle.kysely,
      )
      for (const r of res.rows) if (r.l !== null) out.set(String(r.k), String(r.l))
    }
    return out
  }

  /**
   * Distinct non-null text values of several (connections, vertical, type,
   * path) reads — ONE query (`UNION ALL` + `DISTINCT`), sorted, at most
   * `limit`. For the dashboard's currency list, which unions every money
   * field in scope. Paths are validated before anything runs.
   */
  async distinctValues(selects: readonly DistinctValuesSelect[], limit = 1000): Promise<string[]> {
    const sql = this.sql
    const parts: Array<RawBuilder<unknown>> = []
    for (const s of selects) {
      const t = this.jsonPath(s.path).text
      if (s.connectionIds.length === 0) continue
      const where: Array<RawBuilder<unknown>> = [
        sql`tenant_id IN (${sql.join([...s.connectionIds])})`,
        sql`resource_type = ${s.resourceType}`,
      ]
      if (s.vertical) where.push(sql`vertical = ${s.vertical}`)
      parts.push(sql`SELECT ${t} AS v FROM resources WHERE ${sql.join(where, sql` AND `)}`)
    }
    if (parts.length === 0) return []
    const cap = Math.max(1, Math.floor(limit))
    const res = await sql<{
      v: string | null
    }>`SELECT DISTINCT u.v AS v FROM (${sql.join(parts, sql` UNION ALL `)}) u WHERE u.v IS NOT NULL ORDER BY u.v LIMIT ${cap}`.execute(
      this.handle.kysely,
    )
    return res.rows.map((r) => String(r.v))
  }

  /** Row count and newest change per (connection, vertical, platform, resource type). */
  async countsByConnection(): Promise<ConnectionResourceCount[]> {
    const rows = (await this.handle.kysely
      .selectFrom('resources')
      .select(['tenant_id', 'vertical', 'platform', 'resource_type'])
      .select((eb) => [
        eb.fn.countAll().as('n'),
        eb.fn.max(eb.fn.coalesce('changed_at', 'updated_at')).as('max_changed_at'),
      ])
      .groupBy(['tenant_id', 'vertical', 'platform', 'resource_type'])
      .execute()) as Array<{
      tenant_id: string | null
      vertical: string
      platform: string
      resource_type: string
      n: number | string | bigint
      max_changed_at: number | string | null
    }>
    return rows.map((r) => ({
      connectionId: r.tenant_id,
      vertical: r.vertical,
      platform: r.platform,
      resourceType: r.resource_type,
      count: Number(r.n),
      maxChangedAt: r.max_changed_at === null ? null : Number(r.max_changed_at),
    }))
  }

  /**
   * Fill `changed_at` for rows written before migration 4, `batch` rows per
   * statement so a large table is never locked in one pass. Reads already
   * COALESCE to `updated_at`, so this only makes the change index usable.
   * Returns the number of rows filled.
   */
  async backfillChangedAt(batch = 5000): Promise<number> {
    let total = 0
    for (;;) {
      const res = await this.handle.kysely
        .updateTable('resources')
        .set((eb) => ({ changed_at: eb.ref('updated_at') }))
        .where((eb) =>
          eb(
            'pk',
            'in',
            eb.selectFrom('resources').select('pk').where('changed_at', 'is', null).limit(batch),
          ),
        )
        .executeTakeFirst()
      const n = Number(res.numUpdatedRows ?? 0)
      total += n
      if (n < batch) return total
    }
  }

  /** Total row count across all verticals. Used for size budgets / observability. */
  async count(): Promise<number> {
    const row = await this.handle.kysely
      .selectFrom('resources')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow()
    return Number((row as { n: number | bigint | string }).n)
  }
}
