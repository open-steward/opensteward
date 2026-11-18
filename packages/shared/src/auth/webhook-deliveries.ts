/**
 * WebhookDeliveryStore — durable queue for outbound webhook events, backed by
 * the dual-backend `DbHandle` seam (SQLite or Postgres).
 *
 * Each row represents one (subscription × event) attempt. The emitter
 * enqueues a row at status `pending`; the retry worker drains rows
 * whose `next_attempt_at` has elapsed, POSTs them, and either marks
 * `delivered` or schedules a retry. After `RETRY_DELAYS.length + 1`
 * attempts the row moves to `dead` and stays visible in the admin UI
 * until manually replayed.
 *
 * Receivers can deduplicate using the `event_id` column (mirrored in
 * the `X-OI-Event-Id` header) — re-attempts use the same id.
 */
import { randomUUID } from 'crypto'
import type { DbHandle, DualMigration } from '../db/types'

export type DeliveryStatus = 'pending' | 'delivered' | 'dead'

export interface WebhookDeliveryRow {
  id: string
  subscriptionId: string
  eventId: string
  eventType: string
  url: string
  status: DeliveryStatus
  attempts: number
  nextAttemptAt: number
  deliveredAt: number | null
  lastStatus: number | null
  lastError: string | null
  createdAt: number
}

export interface WebhookDeliveryWithBody extends WebhookDeliveryRow {
  body: string
  signature: string
}

export interface WebhookDeliveryStoreOptions {
  /**
   * Ignored — the store always uses the fixed `webhook_deliveries` table.
   */
  tableName?: string
}

/**
 * Filter clauses shared by `listForSubscription()` and
 * `countForSubscription()` — see `WebhookDeliveryStore.deliveryWhere` for why
 * the two must share one implementation. `countForSubscription()` computes
 * the admin deliveries page's `meta.total`, and if it ever drifted from what
 * `listForSubscription()` actually matched, the pagination control would
 * claim a total that disagreed with the rows on screen — the same failure
 * `EndUserStore.countEndUsers` (`end-users.ts`) was added to close for
 * `/customers`.
 *
 * `subscriptionId` is deliberately NOT a field here: every caller already
 * scopes to one subscription via its own `.where('subscription_id', ...)`
 * before this filter is applied, so it stays a required positional argument
 * on both public methods rather than an optional field this type could omit.
 */
export interface DeliveryFilter {
  status?: DeliveryStatus
  /** Case-insensitive substring match against `event_type` (e.g. `customer.created`). */
  eventType?: string
  /** Case-insensitive substring match against `event_id`. */
  eventId?: string
}

/**
 * UI-key → physical column, for `listForSubscription()`'s optional `sort`. A
 * caller-supplied key is looked up ONLY via `WEBHOOK_DELIVERY_SORT_KEYS.has(...)` (a `Set`
 * of this object's own keys), never `key in WEBHOOK_DELIVERY_SORT_COLUMNS` — `in` also matches
 * `Object.prototype` (`constructor`, `valueOf`, `hasOwnProperty`, …), so
 * `?sort=constructor` would resolve to the `Object` constructor rather than a
 * column name and throw when used as one. Same guard, same reasoning, as
 * `END_USER_SORT_KEYS` in `EndUserStore` (`end-users.ts`) and
 * `CONNECTION_SORT_KEYS` in admin-api's `routes/connections.ts`.
 *
 * Deliberately missing `delivered_at` ("Last attempt") and `next_attempt_at`
 * ("Next attempt"): both are nullable in practice for most rows (only a
 * `delivered` row ever gets a `delivered_at`; `next_attempt_at` is NOT NULL
 * but the admin page's "Next attempt" cell only shows it when
 * `status === 'pending'`), and SQLite/Postgres disagree on where a NULL sorts
 * (`ORDER BY col ASC` puts NULLs first on SQLite, last on Postgres — see Plan
 * 3 Part D's `/audit` fix). Exposing either as a sort key would need the same
 * dialect-specific `.orderBy(col, (ob) => ob.asc().nullsFirst())` treatment
 * for two columns whose admin cell does not even always show the value being
 * sorted on — not worth it here; see the admin route's `deliveriesTable()`
 * for the column-by-column reasoning.
 */
export const WEBHOOK_DELIVERY_SORT_COLUMNS = {
  eventType: 'event_type',
  eventId: 'event_id',
  status: 'status',
  attempts: 'attempts',
} as const
const WEBHOOK_DELIVERY_SORT_KEYS = new Set(Object.keys(WEBHOOK_DELIVERY_SORT_COLUMNS))
type SortableKey = keyof typeof WEBHOOK_DELIVERY_SORT_COLUMNS

/** Backoff schedule (ms): immediate, 5s, 30s, 2m, 10m, 30m, 2h. After
 *  `RETRY_DELAYS.length + 1` attempts (8 total) the delivery dies. */
export const RETRY_DELAYS = [0, 5_000, 30_000, 120_000, 600_000, 1_800_000, 7_200_000]
export const MAX_ATTEMPTS = RETRY_DELAYS.length + 1

/**
 * Response statuses that will never succeed on a later attempt, so the
 * delivery dies immediately instead of burning the whole backoff ladder.
 *
 * These all say "this request is wrong", not "try later": a receiver that
 * rejects the payload shape (Slack answers `400 invalid_payload` to a body it
 * cannot parse), rejects the credential, or has no such endpoint will answer
 * identically two hours from now. Retrying only delays the operator seeing it
 * and fills the queue with work that cannot succeed.
 *
 * Deliberately excluded and still retried: 408 (request timeout), 425 (too
 * early), 429 (rate limited) — all three mean "later", not "never" — plus
 * every 5xx and every network error.
 *
 * A dead delivery can still be replayed by hand once the receiver is fixed.
 */
export const NON_RETRYABLE_STATUSES = new Set([
  400, 401, 403, 404, 405, 406, 410, 413, 414, 415, 422, 501,
])

interface RawRow {
  id: string
  subscription_id: string
  event_id: string
  event_type: string
  url: string
  body: string
  signature: string
  status: DeliveryStatus
  attempts: number
  next_attempt_at: number
  delivered_at: number | null
  last_status: number | null
  last_error: string | null
  created_at: number
}

// Epoch-millisecond columns (next_attempt_at, delivered_at, created_at) are
// INTEGER on SQLite and BIGINT on Postgres (the PostgresDbHandle parses int8
// back to a JS number). `attempts` and `last_status` are small counters that
// stay INTEGER on both. The (status, next_attempt_at) index backs the worker's
// pending drain; the (subscription_id, created_at DESC) index backs the admin
// list — both portable verbatim.
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id              TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        event_id        TEXT NOT NULL,
        event_type      TEXT NOT NULL,
        url             TEXT NOT NULL,
        body            TEXT NOT NULL,
        signature       TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        attempts        INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        delivered_at    INTEGER,
        last_status     INTEGER,
        last_error      TEXT,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
        ON webhook_deliveries (status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
        ON webhook_deliveries (subscription_id, created_at DESC);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id              TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        event_id        TEXT NOT NULL,
        event_type      TEXT NOT NULL,
        url             TEXT NOT NULL,
        body            TEXT NOT NULL,
        signature       TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        attempts        INTEGER NOT NULL DEFAULT 0,
        next_attempt_at BIGINT NOT NULL,
        delivered_at    BIGINT,
        last_status     INTEGER,
        last_error      TEXT,
        created_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
        ON webhook_deliveries (status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
        ON webhook_deliveries (subscription_id, created_at DESC);
    `,
  },
]

export class WebhookDeliveryStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Open the store: apply (any pending) migrations against the shared handle,
   * then return the instance. The handle is BORROWED — it is owned and closed
   * by the boot layer, so this store has no `close()`.
   */
  static async create(
    handle: DbHandle,
    _options?: WebhookDeliveryStoreOptions,
  ): Promise<WebhookDeliveryStore> {
    await handle.migrate('webhook_deliveries', MIGRATIONS)
    return new WebhookDeliveryStore(handle)
  }

  private hydrate(row: RawRow): WebhookDeliveryRow {
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      eventId: row.event_id,
      eventType: row.event_type,
      url: row.url,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      deliveredAt: row.delivered_at,
      lastStatus: row.last_status,
      lastError: row.last_error,
      createdAt: row.created_at,
    }
  }

  async enqueue(input: {
    subscriptionId: string
    eventId: string
    eventType: string
    url: string
    body: string
    signature: string
    /** Override default 0ms initial delay (used by tests / manual replay). */
    delayMs?: number
  }): Promise<WebhookDeliveryRow> {
    const id = randomUUID()
    const now = Date.now()
    const nextAttemptAt = now + (input.delayMs ?? 0)
    await this.handle.kysely
      .insertInto('webhook_deliveries')
      .values({
        id,
        subscription_id: input.subscriptionId,
        event_id: input.eventId,
        event_type: input.eventType,
        url: input.url,
        body: input.body,
        signature: input.signature,
        status: 'pending',
        attempts: 0,
        next_attempt_at: nextAttemptAt,
        delivered_at: null,
        last_status: null,
        last_error: null,
        created_at: now,
      })
      .execute()
    return {
      id,
      subscriptionId: input.subscriptionId,
      eventId: input.eventId,
      eventType: input.eventType,
      url: input.url,
      status: 'pending',
      attempts: 0,
      nextAttemptAt,
      deliveredAt: null,
      lastStatus: null,
      lastError: null,
      createdAt: now,
    }
  }

  /**
   * Pull pending rows whose next_attempt_at has elapsed. Caller is
   * responsible for advancing each row's status via markDelivered or
   * markFailed once delivery completes.
   */
  async nextBatch(limit = 50, now: number = Date.now()): Promise<WebhookDeliveryWithBody[]> {
    const rows = (await this.handle.kysely
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('status', '=', 'pending')
      .where('next_attempt_at', '<=', now)
      .orderBy('next_attempt_at', 'asc')
      .limit(limit)
      .execute()) as RawRow[]
    return rows.map((r) => ({
      ...this.hydrate(r),
      body: r.body,
      signature: r.signature,
    }))
  }

  async markDelivered(id: string, statusCode: number): Promise<void> {
    // Read-then-increment avoids a raw `attempts + 1` SQL expression so the
    // store needs no kysely import (kysely is ESM-only; we only ever touch the
    // handle's instance). markDelivered runs once per successful delivery.
    const row = await this.getById(id)
    if (!row) return
    await this.handle.kysely
      .updateTable('webhook_deliveries')
      .set({
        status: 'delivered',
        delivered_at: Date.now(),
        last_status: statusCode,
        last_error: null,
        attempts: row.attempts + 1,
      })
      .where('id', '=', id)
      .execute()
  }

  /**
   * Increment the attempt count and either schedule a retry or mark the
   * row dead when MAX_ATTEMPTS is reached.
   */
  async markFailed(
    id: string,
    opts: { status: number | null; error: string },
  ): Promise<WebhookDeliveryRow | null> {
    const row = await this.getById(id)
    if (!row) return null
    const attempts = row.attempts + 1
    const terminal = opts.status !== null && NON_RETRYABLE_STATUSES.has(opts.status)
    if (terminal) {
      // Say why in last_error: an operator looking at a delivery that died on
      // attempt 1 needs to know it was rejected, not that the ladder ran out.
      const reason = `${opts.error} — not retryable, delivery failed on attempt ${attempts}`
      await this.handle.kysely
        .updateTable('webhook_deliveries')
        .set({
          status: 'dead',
          attempts,
          last_status: opts.status,
          last_error: reason.slice(0, 240),
        })
        .where('id', '=', id)
        .execute()
    } else if (attempts >= MAX_ATTEMPTS) {
      await this.handle.kysely
        .updateTable('webhook_deliveries')
        .set({
          status: 'dead',
          attempts,
          last_status: opts.status,
          last_error: opts.error.slice(0, 240),
        })
        .where('id', '=', id)
        .execute()
    } else {
      const delay = RETRY_DELAYS[attempts] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
      await this.handle.kysely
        .updateTable('webhook_deliveries')
        .set({
          attempts,
          last_status: opts.status,
          last_error: opts.error.slice(0, 240),
          next_attempt_at: Date.now() + delay,
        })
        .where('id', '=', id)
        .execute()
    }
    return this.getById(id)
  }

  async getById(id: string): Promise<WebhookDeliveryRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as RawRow | undefined
    return row ? this.hydrate(row) : null
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Apply the shared `listForSubscription()`/`countForSubscription()` filter
   * clauses to a Kysely query already scoped to one subscription (via the
   * caller's own `.where('subscription_id', ...)`). All clauses combine with
   * AND. Factored out so a future filter can't be added to one method
   * without the other — see `DeliveryFilter`'s doc comment for what goes
   * wrong when they drift.
   *
   * Generic over `QB` (mirrors `EndUserStore.endUserWhere` /
   * `AdminStore.auditWhere`) because `listForSubscription()` and
   * `countForSubscription()` select different output shapes from the same
   * table — `this.handle.kysely` is typed `Kysely<Record<string, any>>` (see
   * `db/types.ts`), so the exact select-shape generic is not needed for
   * `where` to type-check, only the ability to chain `.where(...)`.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any --
     `QB`'s bound (`{ where: (...args: any[]) => QB }`) erases the concrete
     Kysely expression-builder type from `eb` below, and re-typing it
     accurately here would mean importing Kysely's internal builder generics
     just to describe a parameter this method never inspects — the callback
     is only ever handed to `.where(...)`, never returned or read back. */
  private deliveryWhere<QB extends { where: (...args: any[]) => QB }>(
    qb: QB,
    filter?: DeliveryFilter,
  ): QB {
    let q = qb
    // Exact — `status` is an enum select in the admin UI (see the admin
    // route's `deliveriesTable()`), and a substring match would let one value
    // widen into another (e.g. a filter meant for `dead` also matching some
    // future status containing that substring).
    if (filter?.status) q = q.where('status', '=', filter.status)
    // Case-insensitive substring, same semantics as every other text filter
    // in this feature (`EndUserStore.endUserWhere`, /connections' `f_label`).
    // `eb.fn(...)` carries no explicit `<string>` type argument: a type
    // argument on a call through an `any`-typed callee is a compile error
    // (`TS2347`), whereas the plain call already returns `any` here anyway.
    if (filter?.eventType) {
      const needle = `%${filter.eventType.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['event_type']), 'like', needle))
    }
    if (filter?.eventId) {
      const needle = `%${filter.eventId.toLowerCase()}%`
      q = q.where((eb: any) => eb(eb.fn('lower', ['event_id']), 'like', needle))
    }
    return q
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * List deliveries for one subscription. `offset`/`sort`/`dir`/`eventType`/
   * `eventId` are additive to what this method took before Plan 3 Part C
   * (`limit`/`status` only) — every existing caller (the public
   * `GET /v1/webhook-subscriptions/:id/deliveries` route, its admin twin, and
   * all nine test call sites) passes an object literal or nothing, so a new
   * optional field on the same bag cannot break any of them.
   */
  async listForSubscription(
    subscriptionId: string,
    opts?: DeliveryFilter & {
      limit?: number
      offset?: number
      /**
       * UI column key to order by (see `WEBHOOK_DELIVERY_SORT_COLUMNS`). An unrecognised or
       * omitted value falls back to the default order below, rather than
       * rejecting the request — a stale bookmark or hand-edited URL must
       * degrade gracefully, not 500 (same contract as `EndUserStore.list`'s
       * `sort`).
       */
      sort?: string
      dir?: 'asc' | 'desc'
    },
  ): Promise<WebhookDeliveryRow[]> {
    // `?limit=abc` on the public `GET /v1/webhook-subscriptions/:id/deliveries`
    // route (and its admin twin) reaches here as `Number('abc')` — `NaN` —
    // with no Zod querystring schema to reject it first. `Math.min(NaN, 200)`
    // is itself `NaN`, and Kysely's `.limit(NaN)` throws `SqliteError:
    // datatype mismatch`. Both routes parse with `Number(...)`, not
    // `parseInt`, so `?limit=2.5` reaches here as the fraction `2.5` rather
    // than being truncated first — `Number.isFinite(2.5)` is `true`, so a
    // finite-only guard would let it through to `.limit(2.5)`, and SQLite's
    // `OP_MustBeInt` rejects a non-integral value with the identical
    // `SqliteError: datatype mismatch`. `Number.isInteger` closes both: `NaN`,
    // `0`, a negative number, and a fraction all collapse to the same 50-row
    // default a caller gets by omitting `limit`, then the 200 ceiling still
    // applies.
    const limit =
      Number.isInteger(opts?.limit) && opts!.limit! > 0 ? Math.min(opts!.limit!, 200) : 50
    // Same shape of bug on `?offset=abc` / `?offset=0.5`: `Math.max(NaN, 0)`
    // is `NaN`, and a fractional offset would reach `.offset()` un-truncated
    // for the identical crash. A non-integer, non-finite, or negative offset
    // can't move the window anywhere meaningful, so it collapses to 0 (page
    // one) instead — verbatim precedent: `EndUserStore.list` (`end-users.ts`)
    // and `ConnectSessionStore.list` (`connect-sessions.ts`).
    const offset = Number.isInteger(opts?.offset) && opts!.offset! >= 0 ? opts!.offset! : 0

    let q = this.handle.kysely
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('subscription_id', '=', subscriptionId)
    q = this.deliveryWhere(q, opts)

    const sortKey =
      opts?.sort && WEBHOOK_DELIVERY_SORT_KEYS.has(opts.sort) ? (opts.sort as SortableKey) : null
    const dir = opts?.dir === 'desc' ? 'desc' : 'asc'
    if (sortKey) {
      const col = WEBHOOK_DELIVERY_SORT_COLUMNS[sortKey]
      if (col === 'attempts' || col === 'status') {
        // `attempts` is numeric — no case-folding applies. `status` IS text,
        // but a CLOSED set of three literals ('pending'/'delivered'/'dead')
        // this store itself writes, always already lowercase — nothing
        // upstream ever produces a different casing to fold, so `lower()`
        // buys no correctness here. It does cost something:
        // `idx_webhook_deliveries_pending` is built on the bare `status`
        // column, and `ORDER BY lower(status)` cannot use it. Order by the
        // bare column instead.
        q = q.orderBy(col, dir)
      } else {
        // `event_type`/`event_id` are genuinely free text (an adapter's
        // event names, an upstream platform's own event id) — a bare
        // `ORDER BY` collates by SQLite's BINARY comparison (byte-value, so
        // `'Zebra' < 'apple'`) but Postgres's default locale-aware
        // collation (`'apple' < 'Zebra'`), so the same request returns
        // rows in a different order depending on which dialect answers it.
        // `lower(...)` on both sides of the comparison makes the two agree.
        // Both columns are NOT NULL, so no `.nullsFirst()/.nullsLast()` is
        // needed here — contrast `EndUserStore.list`'s nullable
        // `display_name`/`external_reference`.
        q = q.orderBy(
          (eb) => eb.fn('lower', [col]),
          (ob) => (dir === 'desc' ? ob.desc() : ob.asc()),
        )
      }
      // The DEFAULT ordering always follows as the tiebreaker, never the sort
      // direction. Two rows can share an event type/id/status/attempts count
      // just as easily as they can share `created_at`, and an unbroken tie
      // over LIMIT/OFFSET shows a row on two pages or on none — but WHICH
      // stable order breaks the tie is a choice, and this store used to make
      // the opposite one (`orderBy('id', dir)`). `status` in particular ties
      // constantly: it is a closed set of three values.
      //
      // Both are deterministic and page-stable, so neither was a bug. They
      // are unified here on the rule `AdminStore.listAudit` and
      // `SyncStore.list` state outright, for two reasons: it is the one
      // written down as a rule, so a maintainer reading any store now finds
      // the same answer; and tie order does not flip underneath an operator
      // who only changed the sort direction. This reorders TIED rows only,
      // never distinct ones, on `GET /v1/webhook-subscriptions/:id/deliveries`
      // and the admin deliveries page. Same change, same reasoning, as
      // `EndUserStore.list`.
      //
      // `id` is a `randomUUID`, always lowercase hex, so it needs no
      // case-folding of its own.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    } else {
      // Default order. `created_at` is `Date.now()` epoch-ms written at
      // insert (see `enqueue()`), so a burst of retries or a scripted replay
      // can produce ties — and paging with LIMIT/OFFSET over an unbroken tie
      // shows a row twice or not at all. `id` is a `randomUUID`, so
      // `ORDER BY created_at DESC, id DESC` is deterministic and page-stable
      // — but the tiebreak order WITHIN a tie is arbitrary (id has no
      // relationship to insertion order). That is the right trade for a
      // portable tiebreaker: `rowid` (SQLite) and `oid` (Postgres) are not
      // the same concept, and Postgres does not expose a stable implicit row
      // order at all. Do not "fix" this toward rowid/oid. Same reasoning,
      // same comment, as `EndUserStore.list`.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    }

    const rows = (await q.limit(limit).offset(offset).execute()) as RawRow[]
    return rows.map((r) => this.hydrate(r))
  }

  /**
   * Total rows matching the filter, scoped to one subscription — for the
   * admin deliveries page's pagination metadata.
   *
   * Before this existed, admin-api's `GET /api/webhook-subscriptions/:id/deliveries`
   * asked upstream with only `{ status }` and no `limit`/`offset`
   * (`routes/webhook-subs.ts`), so `listForSubscription` returned its own
   * 50-row default and `meta.total = all.length` was that truncated count —
   * capped at 50 no matter how many deliveries actually existed, so
   * `?page=2` always sliced past the end of that 50-row array and rendered
   * an empty page regardless of how many pages the (also wrong) total
   * claimed to offer. Same shape of bug `EndUserStore.countEndUsers` was
   * added to close for `/customers`.
   */
  async countForSubscription(subscriptionId: string, filter?: DeliveryFilter): Promise<number> {
    const base = this.handle.kysely
      .selectFrom('webhook_deliveries')
      .select((eb) => eb.fn.countAll().as('n'))
      .where('subscription_id', '=', subscriptionId)
    const row = await this.deliveryWhere(base, filter).executeTakeFirstOrThrow()
    // COUNT is `int8`, which node-postgres returns as a STRING by default and
    // SQLite as a number (or a bigint for a very large count). `Number(...)`
    // normalises all three; without it the admin UI's pagination arithmetic
    // would silently become string concatenation on Postgres only.
    //
    // Not observable today, and deliberately kept anyway: `PostgresDbHandle`
    // installs a GLOBAL `types.setTypeParser(INT8, parseInt)` at open
    // (`../db/postgres.ts`), so this count already arrives as a number on both
    // dialects and removing the cast leaves every dual-dialect test green. The
    // cast is what keeps that a performance detail of the handle rather than a
    // correctness dependency of every store on it. Same cast, same caveat, as
    // `AdminStore.countAudit`, `EndUserStore.countEndUsers` and
    // `SyncStore.count`.
    return Number((row as { n: number | bigint | string }).n)
  }

  /** Reset a dead row to pending so the next worker tick picks it up. */
  /**
   * Retention sweep: delete delivered/dead rows older than `cutoff`.
   * Pending rows are never touched — a pending delivery still owes a retry,
   * and pruning it would silently drop an event. The `body` column carries
   * full event payloads (customer emails and connection detail included),
   * which is why unbounded retention here is a data-protection problem, not
   * just a disk one.
   */
  async deleteOlderThan(cutoff: number): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom('webhook_deliveries')
      .where('status', 'in', ['delivered', 'dead'])
      .where('created_at', '<', cutoff)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }

  async replay(id: string): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('webhook_deliveries')
      .set({
        status: 'pending',
        attempts: 0,
        next_attempt_at: Date.now(),
        last_error: null,
        last_status: null,
      })
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }
}
