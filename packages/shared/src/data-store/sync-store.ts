/**
 * SyncStore — backend-agnostic persistence for background sync jobs across
 * every vertical. Lives in the same database as ResourceStore so workers and
 * cached reads share a single backend connection (the shared `DbHandle`).
 *
 * Jobs are partitioned by `vertical`. Every read takes a vertical so a
 * crm worker never picks up a logistics job.
 *
 * BORROWER — the handle is owned by ResourceStore's boot layer (passed in via
 * `ResourceStore.getHandle()`); SyncStore MUST NOT close it. It owns only its
 * own `sync_jobs` migration namespace within that shared backend.
 */

import { randomUUID } from 'node:crypto'
// Type-only, ESM-resolved: the tag itself is loaded with a dynamic import in
// `create()` — the same arrangement as ResourceStore, and for the same reason
// (this package is CommonJS, kysely is ESM).
import type { sql as SqlTag } from 'kysely' with { 'resolution-mode': 'import' }
import {
  SyncJobOriginSchema,
  type SyncJob,
  type SyncJobOrigin,
  type ResourceProgress,
} from './sync-schema'
import type { SyncHistory } from './sync-schedule'
import type { DbHandle, DualMigration } from '../db/types'
import { isUniqueViolation } from '../db/sql-errors'

interface SyncJobRow {
  id: string
  vertical: string
  connection_id: string
  platform: string
  tenant_id: string | null
  status: string
  progress: string | null
  error: string | null
  callback_url: string | null
  created_at: number
  started_at: number | null
  completed_at: number | null
  origin: string | null
}

function rowToJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    vertical: row.vertical,
    connectionId: row.connection_id,
    platform: row.platform,
    tenantId: row.tenant_id,
    status: row.status as SyncJob['status'],
    progress: row.progress ? (JSON.parse(row.progress) as Record<string, ResourceProgress>) : null,
    error: row.error,
    callbackUrl: row.callback_url,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    // A value outside the enum (a hand edit) reads as unknown, not as a lie.
    origin: SyncJobOriginSchema.safeParse(row.origin).success
      ? (row.origin as SyncJobOrigin)
      : null,
  }
}

/**
 * The `error` of a row migration v2 superseded (its UPDATE writes
 * 'Superseded: another sync was already queued for this connection'). Such a
 * job never ran, so `historyFor` leaves it out: it is no outcome, no failure,
 * and no evidence the connection was ever queued.
 */
const SUPERSEDED_LIKE = 'Superseded:%'

// Epoch-millisecond columns (created_at, started_at, completed_at) are INTEGER
// on SQLite and BIGINT on Postgres (the PostgresDbHandle parses int8 back to a
// JS number). `progress` is a JSON-as-TEXT column on both dialects (the store
// serialises / parses in JS). Both lookup indexes are valid verbatim on both.
/** Exported for the migration test only; `SyncStore.create` applies all of it. */
export const SYNC_JOBS_MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL DEFAULT '',
        connection_id TEXT NOT NULL DEFAULT '',
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        progress      TEXT,
        error         TEXT,
        callback_url  TEXT,
        created_at    INTEGER NOT NULL,
        started_at    INTEGER,
        completed_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_lookup
        ON sync_jobs (vertical, connection_id, status);
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_pending
        ON sync_jobs (vertical, status, created_at);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id            TEXT PRIMARY KEY,
        vertical      TEXT NOT NULL DEFAULT '',
        connection_id TEXT NOT NULL DEFAULT '',
        platform      TEXT NOT NULL,
        tenant_id     TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        progress      TEXT,
        error         TEXT,
        callback_url  TEXT,
        created_at    BIGINT NOT NULL,
        started_at    BIGINT,
        completed_at  BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_lookup
        ON sync_jobs (vertical, connection_id, status);
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_pending
        ON sync_jobs (vertical, status, created_at);
    `,
  },
  {
    // v2: why each job exists (`origin`), and at most ONE active job per
    // connection. Every enqueue path did check-then-insert (`findActive`, then
    // `create`), which two replicas sharing a Postgres store could both pass —
    // and the sync scheduler makes enqueues routine. The partial unique index
    // makes the database the arbiter (`createIfIdle`).
    //
    // Duplicates that already exist would stop the index from building, so
    // they are superseded first. The oldest active job per connection is kept:
    // a row is superseded only when an OLDER active row exists, and the oldest
    // never matches — so the result does not depend on the order the UPDATE
    // visits rows in.
    //
    // idx_sync_jobs_connection_history serves every per-connection question
    // asked of finished jobs — `historyFor`, `cleanup`, and the supersede pass
    // just below — each of which seeks "this connection's jobs of this status
    // from this created_at on". Without it, no index leads with connection_id
    // (the lookup index leads with vertical; the unique one is partial), so
    // each correlated subquery scanned the table once per outer row:
    // quadratic, and on SQLite it blocks the event loop while it runs. It is
    // built before the UPDATE so that pass is a seek per row too.
    version: 2,
    sqlite: `
      ALTER TABLE sync_jobs ADD COLUMN origin TEXT;
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_connection_history
        ON sync_jobs (connection_id, status, created_at);
      UPDATE sync_jobs
         SET status = 'failed',
             error = 'Superseded: another sync was already queued for this connection',
             completed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
       WHERE status IN ('pending', 'running')
         AND EXISTS (
           SELECT 1 FROM sync_jobs AS older
            WHERE older.connection_id = sync_jobs.connection_id
              AND older.status IN ('pending', 'running')
              AND (older.created_at < sync_jobs.created_at
                   OR (older.created_at = sync_jobs.created_at AND older.id < sync_jobs.id)));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_one_active
        ON sync_jobs (connection_id) WHERE status IN ('pending', 'running');
    `,
    postgres: `
      ALTER TABLE sync_jobs ADD COLUMN origin TEXT;
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_connection_history
        ON sync_jobs (connection_id, status, created_at);
      UPDATE sync_jobs
         SET status = 'failed',
             error = 'Superseded: another sync was already queued for this connection',
             completed_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
       WHERE status IN ('pending', 'running')
         AND EXISTS (
           SELECT 1 FROM sync_jobs AS older
            WHERE older.connection_id = sync_jobs.connection_id
              AND older.status IN ('pending', 'running')
              AND (older.created_at < sync_jobs.created_at
                   OR (older.created_at = sync_jobs.created_at AND older.id < sync_jobs.id)));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_one_active
        ON sync_jobs (connection_id) WHERE status IN ('pending', 'running');
    `,
  },
]

/**
 * Everything `list()` and `count()` take. The WHERE-clause fields are shared
 * by both (through `syncWhere`); `limit`, `offset`, `sort` and `dir` shape the
 * page and are ignored by `count()`, which counts every matching row by
 * definition.
 *
 * `vertical`, `connectionId` and `status` keep their exact-match meaning
 * untouched — the public `GET /v1/{vertical}/sync` router passes all three and
 * gains nothing from this task.
 */
export interface SyncListFilter {
  /** Exact match. */
  vertical?: string
  /**
   * Case-insensitive SUBSTRING match on the platform slug — this is the admin
   * table's Platform column filter, and every text filter in that row matches
   * a substring case-insensitively. No caller passed `filter.platform` before
   * this existed (verified repo-wide), so loosening it changed nothing.
   */
  platform?: string
  /**
   * EXACT match, and it must stay exact. `GET /v1/{vertical}/sync` scopes a
   * Bearer caller to their OWN connection with this field: turning it into a
   * substring match would let one caller's connection id prefix pull back
   * another caller's jobs. `connectionIdContains` below is the separate,
   * admin-only substring field — do not merge the two.
   */
  connectionId?: string
  /** Exact match. */
  status?: string
  /** Exact match, on the connection's owning tenant. Nullable column: a job
   *  with no tenant matches no tenant id. */
  tenantId?: string
  /** Case-insensitive substring match on the job id. */
  idContains?: string
  /** Case-insensitive substring match on the connection id — the admin table's
   *  Connection column filter. See `connectionId` for why this is separate. */
  connectionIdContains?: string
  limit?: number
  offset?: number
  /** A key of `SYNC_SORT_COLUMNS`. Anything else falls back to the default
   *  order rather than throwing. */
  sort?: string
  dir?: 'asc' | 'desc'
}

/**
 * UI sort key -> physical `sync_jobs` column. A caller-supplied value must
 * never reach Kysely's `orderBy`: Kysely 0.29.4 still parses the deprecated
 * `'col dir'` string form, so `?sort=created_at desc` throws
 * `Cannot specify direction twice!` and `?sort=__proto__` throws
 * `no such column` — both unhandled 500s, not injection.
 *
 * `id` is deliberately absent: it is a `randomUUID`, so ordering by it tells
 * an operator nothing. `progress` is absent because the admin table computes
 * it in the template from a JSON blob, which cannot be ordered in SQL without
 * dialect-specific JSON work.
 */
export const SYNC_SORT_COLUMNS = {
  vertical: 'vertical',
  platform: 'platform',
  connection: 'connection_id',
  tenant: 'tenant_id',
  status: 'status',
  created: 'created_at',
} as const

export type SyncSortKey = keyof typeof SYNC_SORT_COLUMNS

/** Own-keys-only membership test. `'constructor' in SYNC_SORT_COLUMNS` is
 *  `true` and would put `Object.prototype.constructor` into an `orderBy`. */
const SYNC_SORT_KEYS = new Set(Object.keys(SYNC_SORT_COLUMNS))
export function isSyncSortKey(v: string | undefined): v is SyncSortKey {
  return v !== undefined && SYNC_SORT_KEYS.has(v)
}

export class SyncStore {
  private constructor(
    private readonly handle: DbHandle,
    private readonly sql: typeof SqlTag,
  ) {}

  /**
   * Open the store on the shared data-store handle (the one owned and migrated
   * by ResourceStore — pass `resourceStore.getHandle()`). Applies the
   * `sync_jobs` migration namespace, then returns the instance. BORROWER —
   * MUST NOT close the handle (ResourceStore's boot layer owns it).
   */
  static async create(handle: DbHandle): Promise<SyncStore> {
    await handle.migrate('sync_jobs', SYNC_JOBS_MIGRATIONS)
    const { sql } = await import('kysely')
    return new SyncStore(handle, sql)
  }

  async create(
    vertical: string,
    connectionId: string,
    platform: string,
    tenantId: string | null,
    callbackUrl: string | null,
    origin: SyncJobOrigin | null = null,
  ): Promise<SyncJob> {
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('sync_jobs')
      .values({
        id,
        vertical,
        connection_id: connectionId,
        platform,
        tenant_id: tenantId,
        status: 'pending',
        callback_url: callbackUrl,
        created_at: now,
        origin,
      })
      .execute()
    return (await this.get(id))!
  }

  async get(id: string): Promise<SyncJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('sync_jobs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as SyncJobRow | undefined
    return row ? rowToJob(row) : null
  }

  /**
   * Every WHERE clause `list()` and `count()` share.
   *
   * Factored out BEFORE `count()` existed, for the reason `EndUserStore`'s
   * `endUserWhere` documents: a clause that lives in `list()` alone makes the
   * two disagree about which rows match, and the pagination then lies — the
   * page is narrowed while `meta.total` counts the whole table.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private syncWhere<QB extends { where: (...args: any[]) => QB }>(
    qb: QB,
    filter?: SyncListFilter,
  ): QB {
    let q = qb
    if (filter?.vertical) q = q.where('vertical', '=', filter.vertical)
    // Case-insensitive substring — see `SyncListFilter.platform`. `eb.fn(...)`
    // carries no explicit `<string>` type argument: a type argument on a call
    // through an `any`-typed callee is a compile error (TS2347), and the plain
    // call already returns `any` here.
    if (filter?.platform) {
      const needle = `%${filter.platform.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['platform']), 'like', needle))
    }
    // EXACT, and load-bearing: this is how `/v1/{vertical}/sync` scopes a
    // caller to their own connection.
    if (filter?.connectionId) q = q.where('connection_id', '=', filter.connectionId)
    if (filter?.status) q = q.where('status', '=', filter.status)
    if (filter?.tenantId) q = q.where('tenant_id', '=', filter.tenantId)
    if (filter?.idContains) {
      const needle = `%${filter.idContains.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['id']), 'like', needle))
    }
    if (filter?.connectionIdContains) {
      const needle = `%${filter.connectionIdContains.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['connection_id']), 'like', needle))
    }
    return q
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /**
   * Total rows matching the filter — for the admin list's pagination metadata.
   *
   * Before this existed, admin-api's `/api/sync-jobs?page=` asked upstream for
   * `Math.min(page * limit + 1, 200)` rows and read that window's length as
   * `meta.total`, which hard-capped the whole table at 200 rows / 4 pages: row
   * 201 was unreachable from the admin UI at any page size. A real COUNT has
   * no such ceiling.
   */
  async count(filter?: SyncListFilter): Promise<number> {
    const base = this.handle.kysely.selectFrom('sync_jobs').select((eb) => eb.fn.countAll().as('n'))
    const row = await this.syncWhere(base, filter).executeTakeFirstOrThrow()
    // COUNT is `int8`, which node-postgres returns as a STRING by default and
    // SQLite as a number (or a bigint for a very large count). `Number(...)`
    // normalises all three, and without it the admin UI's pagination
    // arithmetic would silently become string concatenation on Postgres only.
    //
    // Not observable today, and deliberately kept anyway: `PostgresDbHandle`
    // installs a GLOBAL `types.setTypeParser(INT8, parseInt)` at open
    // (`../db/postgres.ts`), so this count already arrives as a number on both
    // dialects and removing the cast leaves every dual-dialect test green.
    // The cast is what keeps that a performance detail of the handle rather
    // than a correctness dependency of every store on it. Same cast, same
    // caveat, as `AdminStore.countAudit`, `EndUserStore.countEndUsers` and
    // `WebhookDeliveryStore.countForSubscription` — all four now say so, since
    // a comment naming three siblings that contradict it is worse than none.
    return Number((row as { n: number | bigint | string }).n)
  }

  /**
   * Jobs created in `[fromMs, toMs)` counted per UTC day and status — the
   * dashboards' "sync outcomes" metric. `connectionIds: null` counts every
   * connection; an empty list counts none. Days are epoch-day numbers
   * (`created_at / 86 400 000`, truncated) grouped in a subquery, which keeps
   * the arithmetic identical on both dialects.
   */
  async outcomesByDay(opts: {
    connectionIds: readonly string[] | null
    fromMs: number
    toMs: number
  }): Promise<Array<{ day: string; status: string; count: number }>> {
    if (opts.connectionIds && opts.connectionIds.length === 0) return []
    const DAY_MS = 86_400_000
    let inner = this.handle.kysely
      .selectFrom('sync_jobs')
      // CAST: better-sqlite3 binds the divisor as a REAL, which would make the
      // division fractional there; Postgres divides bigints either way.
      .select((eb) => [eb.cast<number>(eb('created_at', '/', DAY_MS), 'integer').as('d'), 'status'])
      .where('created_at', '>=', opts.fromMs)
      .where('created_at', '<', opts.toMs)
    if (opts.connectionIds) inner = inner.where('connection_id', 'in', [...opts.connectionIds])
    const rows = (await this.handle.kysely
      .selectFrom(inner.as('j'))
      .select(['j.d', 'j.status'])
      .select((eb) => eb.fn.countAll().as('n'))
      .groupBy(['j.d', 'j.status'])
      .orderBy('j.d')
      .execute()) as Array<{
      d: number | string | bigint
      status: string
      n: number | string | bigint
    }>
    return rows.map((r) => ({
      // Integer division on both dialects; Math.floor guards a REAL result.
      day: new Date(Math.floor(Number(r.d)) * DAY_MS).toISOString().slice(0, 10),
      status: r.status,
      count: Number(r.n),
    }))
  }

  async list(filter?: SyncListFilter): Promise<SyncJob[]> {
    let q = this.handle.kysely.selectFrom('sync_jobs').selectAll()
    q = this.syncWhere(q, filter)

    const key = isSyncSortKey(filter?.sort) ? filter!.sort! : null
    const dir = filter?.dir === 'desc' ? 'desc' : 'asc'
    if (key === 'created') {
      // The primary already IS `created_at`; emitting it twice below would
      // leave the second copy (always `desc`) deciding nothing while looking
      // like it overrode the operator's choice. Named through the map rather
      // than as a literal so this branch cannot silently disagree with
      // `SYNC_SORT_COLUMNS.created`.
      q = q.orderBy(SYNC_SORT_COLUMNS.created, dir).orderBy('id', 'desc')
    } else if (key) {
      const col = SYNC_SORT_COLUMNS[key]
      // Both dialects must answer the same request in the same order, and two
      // things make them differ. `lower()` closes the first: a bare `ORDER BY`
      // on TEXT collates by SQLite's BINARY comparison (byte value, so
      // `'Zulu' < 'alpha'`) but Postgres's locale-aware default. `.nullsLast()`
      // closes the second: SQLite puts NULLs first on ASC and last on DESC,
      // Postgres the reverse — pinned to LAST in both directions, the same
      // rule `table-controls.ts`'s in-memory sort already applies ("Absent
      // values sort last in BOTH directions").
      //
      // Neither is applied blindly, because each costs an index. `lower()` on
      // a column whose values cannot vary in case buys nothing and makes an
      // index on it unusable for the sort (Part C shipped exactly that on
      // `webhook_deliveries.status`); `.nullsLast()` on a NOT NULL column is a
      // semantic no-op that can still push Postgres into a sort where an
      // index-ordered scan would have served. The line is what the DDL above
      // enforces plus who writes the value:
      //   vertical      NOT NULL DEFAULT '', and written from the nine
      //                 lowercase vertical slugs. Neither applies.
      //   platform      NOT NULL, written from the connection row's adapter
      //                 slug — a catalogue key, always lowercase. Neither
      //                 applies. (The platform FILTER above is still
      //                 case-insensitive: that folds what an OPERATOR TYPES,
      //                 which is arbitrary, not what the column holds.)
      //   connection_id NOT NULL DEFAULT '', a `randomUUID` — lowercase hex.
      //                 Neither applies.
      //   status        NOT NULL, and a closed lowercase set
      //                 (pending/running/completed/failed). `lower()` here
      //                 would also cost `idx_sync_jobs_lookup`.
      //   tenant_id     NULLABLE, and caller-supplied free text of arbitrary
      //                 case (it comes from the connection's owning tenant id,
      //                 which an operator names). BOTH apply, and no index
      //                 covers it.
      if (col === 'tenant_id') {
        q = q.orderBy(
          (eb) => eb.fn('lower', [col]),
          (ob) => (dir === 'desc' ? ob.desc() : ob.asc()).nullsLast(),
        )
      } else {
        q = q.orderBy(col, dir)
      }
      // The default ordering ALWAYS follows as the tiebreaker, never the sort
      // direction: Postgres gives no implicit row order on equal keys, so
      // OFFSET paging over a tie shows a row twice or not at all.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    } else {
      // No sort, or a key outside the allow-list: exactly the order this
      // method has always returned, plus an `id` tiebreaker. An unknown key is
      // ignored rather than refused — it arrives from a stale bookmark, and
      // the default order is a better answer than a 500.
      //
      // `created_at` is `Date.now()` epoch-ms written at insert, so a bulk
      // enqueue ties; paging with LIMIT/OFFSET over an unbroken tie shows a
      // row twice or not at all. `id` is a `randomUUID`, so the order WITHIN a
      // tie is arbitrary but stable — the right trade for a portable
      // tiebreaker, since SQLite's `rowid` and Postgres's `oid` are not the
      // same concept and Postgres exposes no stable implicit row order at all.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    }
    // `if (filter?.limit)` treated both `NaN` (`?limit=abc` failing the
    // router's `parseInt`) and `0` (`?limit=0`) as falsy and skipped
    // `.limit()` entirely — turning a request for a bounded page into an
    // unbounded dump of every sync job for the connection, on the public
    // `GET /v1/{vertical}/sync` route in all nine verticals. `Number.isInteger`
    // (not `isFinite`) also closes a fractional `limit`: nothing routes one
    // here today, but a value that survived `isFinite` (e.g. `2.5`) would
    // still hit SQLite's `OP_MustBeInt` and 500 with the identical
    // `SqliteError: datatype mismatch` A1/A6 had.
    //
    // A `limit` key that is entirely OMITTED is bounded the same way, not
    // left unbounded: every current caller (the public `/sync` router, the
    // admin cross-vertical index, and admin-api's sync-jobs route) always
    // computes and passes an explicit number, so this branch is unreachable
    // over HTTP today — but every sibling store treats "no limit specified"
    // as "the store's default applies" (`EndUserStore` 50/200,
    // `WebhookDeliveryStore` 50/200, `ConnectSessionStore` 100/500,
    // `AdminStore.listAudit` 100), and Part E rewrites this exact method.
    // A future non-paginated caller inheriting "omitted = unbounded" on a
    // public route would have no compiler and no test to catch it.
    const requested =
      filter?.limit !== undefined && Number.isInteger(filter.limit) && filter.limit > 0
        ? filter.limit
        : 50
    q = q.limit(Math.min(requested, 200))
    // Same clamp shape, same reason: `Number.isInteger`, NOT `Number.isFinite`
    // — `isFinite(2.5)` is `true`, and a fractional offset reaches SQLite's
    // `OP_MustBeInt` and throws `SqliteError: datatype mismatch`. A
    // non-integer, negative or absent offset can't move the window anywhere
    // meaningful, so it collapses to 0 (page one).
    q = q.offset(
      filter?.offset !== undefined && Number.isInteger(filter.offset) && filter.offset >= 0
        ? filter.offset
        : 0,
    )
    const rows = (await q.execute()) as SyncJobRow[]
    return rows.map(rowToJob)
  }

  /** Find an active (pending/running) job for the same connection within a vertical. */
  async findActive(vertical: string, connectionId: string): Promise<SyncJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('sync_jobs')
      .selectAll()
      .where('vertical', '=', vertical)
      .where('connection_id', '=', connectionId)
      .where('status', 'in', ['pending', 'running'])
      .limit(1)
      .executeTakeFirst()) as SyncJobRow | undefined
    return row ? rowToJob(row) : null
  }

  /**
   * Enqueue a sync unless one is already pending or running for the
   * connection. Atomic across processes: `idx_sync_jobs_one_active` refuses a
   * second active row, so two replicas — or a scheduler tick and a Sync now —
   * cannot both enqueue. Returns the job that is active now and whether this
   * call created it.
   */
  async createIfIdle(input: {
    vertical: string
    connectionId: string
    platform: string
    tenantId: string | null
    callbackUrl?: string | null
    origin: SyncJobOrigin
  }): Promise<{ job: SyncJob; created: boolean }> {
    // Bounded: each retry needs the active job to finish between our insert
    // and our lookup, which a sync does not do three times in a row.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const job = await this.create(
          input.vertical,
          input.connectionId,
          input.platform,
          input.tenantId,
          input.callbackUrl ?? null,
          input.origin,
        )
        return { job, created: true }
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        // Looked up by the index's own key — the connection alone, not
        // vertical + connection — so it finds exactly the row that refused
        // the insert.
        const row = (await this.handle.kysely
          .selectFrom('sync_jobs')
          .selectAll()
          .where('connection_id', '=', input.connectionId)
          .where('status', 'in', ['pending', 'running'])
          .limit(1)
          .executeTakeFirst()) as SyncJobRow | undefined
        if (row) return { job: rowToJob(row), created: false }
      }
    }
    throw new Error(
      `Could not enqueue a sync for ${input.connectionId}: its active job kept changing.`,
    )
  }

  /**
   * Claim the oldest pending job of a vertical: flip it to running only if it
   * is still pending, so two workers (two replicas) never both run one job.
   * Null when nothing is pending. A lost race moves on to the next candidate.
   *
   * `excludeConnectionIds` skips pending jobs of those connections. A worker
   * passes the connections it is still running: an admin cancel marks a
   * running job failed, which frees the connection's slot in
   * `idx_sync_jobs_one_active`, but does not stop the run — so the database
   * alone would let that connection's next job start beside it.
   */
  async claimNext(
    vertical: string,
    excludeConnectionIds?: ReadonlySet<string>,
  ): Promise<SyncJob | null> {
    const skip = excludeConnectionIds?.size ? [...excludeConnectionIds] : null
    for (let attempt = 0; attempt < 5; attempt++) {
      let q = this.handle.kysely
        .selectFrom('sync_jobs')
        .selectAll()
        .where('vertical', '=', vertical)
        .where('status', '=', 'pending')
      if (skip) q = q.where('connection_id', 'not in', skip)
      const row = (await q
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .limit(1)
        .executeTakeFirst()) as SyncJobRow | undefined
      if (!row) return null
      const startedAt = Date.now()
      const res = await this.handle.kysely
        .updateTable('sync_jobs')
        .set({ status: 'running', started_at: startedAt })
        .where('id', '=', row.id)
        .where('status', '=', 'pending')
        .executeTakeFirst()
      if (Number(res.numUpdatedRows) === 1) {
        return rowToJob({ ...row, status: 'running', started_at: startedAt })
      }
    }
    return null
  }

  /** Jobs waiting (not yet running) in one vertical — the scheduler's back-pressure signal. */
  async countPending(vertical: string): Promise<number> {
    return this.count({ vertical, status: 'pending' })
  }

  /**
   * What the sync schedule needs to know about each connection's jobs, in
   * three grouped queries per 500 ids. A connection with no jobs at all is
   * absent from the map (callers read it as EMPTY_SYNC_HISTORY).
   *
   * "Newer" means later by `(created_at, id)` in every query here and in
   * `cleanup` — the order `claimNext` runs jobs in — so jobs sharing a
   * millisecond cannot read as the latest in one query and as older in
   * another. Each predicate is written `created_at >= x AND (created_at > x
   * OR id > y)` so idx_sync_jobs_connection_history can seek it: the
   * `(connection_id, status)` prefix by equality, `created_at` by range.
   *
   * Rows migration v2 superseded never ran and are left out entirely (see
   * SUPERSEDED_LIKE).
   */
  async historyFor(connectionIds: readonly string[]): Promise<Map<string, SyncHistory>> {
    const out = new Map<string, SyncHistory>()
    const sql = this.sql
    const ran = (alias: 'j' | 'k') =>
      sql`(${sql.ref(`${alias}.error`)} IS NULL OR ${sql.ref(`${alias}.error`)} NOT LIKE ${SUPERSEDED_LIKE})`
    const CHUNK = 500
    for (let i = 0; i < connectionIds.length; i += CHUNK) {
      const ids = sql.join(connectionIds.slice(i, i + CHUNK))
      const agg = await sql<{
        connection_id: string
        active: number | string
        last_success_at: number | string | null
      }>`
        SELECT j.connection_id,
               MAX(CASE WHEN j.status IN ('pending', 'running') THEN 1 ELSE 0 END) AS active,
               MAX(CASE WHEN j.status = 'completed' THEN COALESCE(j.completed_at, j.created_at) END)
                 AS last_success_at
          FROM sync_jobs j
         WHERE j.connection_id IN (${ids})
           AND ${ran('j')}
         GROUP BY j.connection_id`.execute(this.handle.kysely)
      const latest = await sql<{
        connection_id: string
        status: string
        finished_at: number | string
      }>`
        SELECT j.connection_id, j.status, COALESCE(j.completed_at, j.created_at) AS finished_at
          FROM sync_jobs j
         WHERE j.connection_id IN (${ids})
           AND j.status IN ('completed', 'failed')
           AND ${ran('j')}
           AND NOT EXISTS (
             SELECT 1 FROM sync_jobs k
              WHERE k.connection_id = j.connection_id
                AND k.status IN ('completed', 'failed')
                AND k.created_at >= j.created_at
                AND (k.created_at > j.created_at OR k.id > j.id)
                AND ${ran('k')})`.execute(this.handle.kysely)
      // v2 only retires active rows, but in a rolling deploy a pre-v2 replica
      // can still complete a job v2 superseded under it: markCompleted leaves
      // the error, so the row reads completed AND superseded. The inner query
      // leaves it out like the two above, or it would end the run of failures
      // that `latest` and `agg` say is still going.
      const failures = await sql<{ connection_id: string; n: number | string }>`
        SELECT j.connection_id, COUNT(*) AS n
          FROM sync_jobs j
         WHERE j.connection_id IN (${ids})
           AND j.status = 'failed'
           AND ${ran('j')}
           AND NOT EXISTS (
             SELECT 1 FROM sync_jobs k
              WHERE k.connection_id = j.connection_id
                AND k.status = 'completed'
                AND k.created_at >= j.created_at
                AND (k.created_at > j.created_at OR k.id > j.id)
                AND ${ran('k')})
         GROUP BY j.connection_id`.execute(this.handle.kysely)

      const latestBy = new Map(latest.rows.map((r) => [r.connection_id, r]))
      const failuresBy = new Map(failures.rows.map((r) => [r.connection_id, Number(r.n)]))
      for (const r of agg.rows) {
        const last = latestBy.get(r.connection_id)
        out.set(r.connection_id, {
          active: Number(r.active) === 1,
          everQueued: true,
          lastFinishedAt: last ? Number(last.finished_at) : null,
          lastStatus: last ? (last.status as 'completed' | 'failed') : null,
          lastSuccessAt: r.last_success_at === null ? null : Number(r.last_success_at),
          consecutiveFailures: failuresBy.get(r.connection_id) ?? 0,
        })
      }
    }
    return out
  }

  /** Pick up the next pending job for a vertical. */
  async findPending(vertical: string): Promise<SyncJob | null> {
    const row = (await this.handle.kysely
      .selectFrom('sync_jobs')
      .selectAll()
      .where('vertical', '=', vertical)
      .where('status', '=', 'pending')
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst()) as SyncJobRow | undefined
    return row ? rowToJob(row) : null
  }

  async markRunning(id: string): Promise<void> {
    await this.handle.kysely
      .updateTable('sync_jobs')
      .set({ status: 'running', started_at: Date.now() })
      .where('id', '=', id)
      .execute()
  }

  async updateProgress(id: string, progress: Record<string, ResourceProgress>): Promise<void> {
    await this.handle.kysely
      .updateTable('sync_jobs')
      .set({ progress: JSON.stringify(progress) })
      .where('id', '=', id)
      .execute()
  }

  async markCompleted(id: string, progress: Record<string, ResourceProgress>): Promise<void> {
    await this.handle.kysely
      .updateTable('sync_jobs')
      .set({ status: 'completed', progress: JSON.stringify(progress), completed_at: Date.now() })
      .where('id', '=', id)
      .execute()
  }

  async markFailed(
    id: string,
    error: string,
    progress?: Record<string, ResourceProgress>,
  ): Promise<void> {
    await this.handle.kysely
      .updateTable('sync_jobs')
      .set({
        status: 'failed',
        error,
        progress: progress ? JSON.stringify(progress) : null,
        completed_at: Date.now(),
      })
      .where('id', '=', id)
      .execute()
  }

  /** Reset any running jobs back to pending (crash recovery on startup). Optionally scoped to one vertical. */
  async resetRunning(vertical?: string): Promise<number> {
    let q = this.handle.kysely
      .updateTable('sync_jobs')
      .set({ status: 'pending', started_at: null })
      .where('status', '=', 'running')
    if (vertical) q = q.where('vertical', '=', vertical)
    const res = await q.executeTakeFirst()
    return Number(res.numUpdatedRows)
  }

  /** Drop every job for one connection — cascade target for connection deletes. */
  async deleteForConnection(vertical: string, connectionId: string): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom('sync_jobs')
      .where('vertical', '=', vertical)
      .where('connection_id', '=', connectionId)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }

  /**
   * Delete finished jobs older than `days` — except what a schedule still
   * reads. A job goes only when a NEWER completed job exists for the same
   * connection, so each connection keeps its latest success and every failure
   * since. Without that, a connection on a 30-day interval (or one last synced
   * long ago) would lose its last sync at the retention boundary, read as
   * never synced, and be re-synced early; its "Last synced" would go blank.
   *
   * "Newer" is by `(created_at, id)`, the order `historyFor` reads, written
   * so idx_sync_jobs_connection_history can seek it (see `historyFor`).
   */
  async cleanup(days: number): Promise<number> {
    const cutoff = Date.now() - days * 86_400_000
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const res = await this.handle.kysely
      .deleteFrom('sync_jobs')
      .where('status', 'in', ['completed', 'failed'])
      .where('created_at', '<', cutoff)
      .where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('sync_jobs as newer')
            .select('newer.id')
            .whereRef('newer.connection_id', '=', 'sync_jobs.connection_id')
            .where('newer.status', '=', 'completed')
            .whereRef('newer.created_at', '>=', 'sync_jobs.created_at')
            .where((nb: any) =>
              nb.or([
                nb('newer.created_at', '>', nb.ref('sync_jobs.created_at')),
                nb('newer.id', '>', nb.ref('sync_jobs.id')),
              ]),
            ),
        ),
      )
      .executeTakeFirst()
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return Number(res.numDeletedRows)
  }
}
