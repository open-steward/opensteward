import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import {
  WebhookDeliveryStore,
  RETRY_DELAYS,
  MAX_ATTEMPTS,
  WEBHOOK_DELIVERY_SORT_COLUMNS,
} from '../../src/auth/webhook-deliveries'

// SQLite always (`:memory:` is fresh per open); Postgres when TEST_DATABASE_URL
// is set (CI service container / local docker). For Postgres each test drops the
// public schema before creating the store so the shared db stays isolated.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('WebhookDeliveryStore [$name]', (backend) => {
  let handle: DbHandle
  let store: WebhookDeliveryStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await WebhookDeliveryStore.create(handle)
  })

  afterEach(async () => {
    await handle?.close()
  })

  function enqueue() {
    return store.enqueue({
      subscriptionId: 'sub1',
      eventId: 'evt1',
      eventType: 'customer.created',
      url: 'https://example.test/x',
      body: '{"data":{"id":"c1"}}',
      signature: 'abc123',
    })
  }

  it('enqueues a row at status=pending with attempts=0', async () => {
    const row = await enqueue()
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(row.nextAttemptAt).toBeLessThanOrEqual(Date.now() + 50)
  })

  it('nextBatch returns rows whose next_attempt_at has elapsed', async () => {
    const s = store
    const a = await s.enqueue({
      subscriptionId: 's',
      eventId: 'a',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: 'sig',
      delayMs: 0,
    })
    const b = await s.enqueue({
      subscriptionId: 's',
      eventId: 'b',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: 'sig',
      delayMs: 60_000,
    })
    const batch = await s.nextBatch(10)
    expect(batch.map((r) => r.id)).toEqual([a.id])
    expect(batch[0].body).toBe('{}')

    // Future-now flushes the second row too.
    const future = await s.nextBatch(10, Date.now() + 120_000)
    expect(future.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('markDelivered records status and stops the row from re-emerging', async () => {
    const s = store
    const row = await enqueue()
    await s.markDelivered(row.id, 200)
    const after = (await s.getById(row.id))!
    expect(after.status).toBe('delivered')
    expect(after.lastStatus).toBe(200)
    expect(after.attempts).toBe(1)
    expect(await s.nextBatch(10)).toEqual([])
  })

  it('markFailed schedules a retry with the next backoff', async () => {
    const s = store
    const row = await enqueue()
    const after = (await s.markFailed(row.id, { status: 502, error: 'bad gateway' }))!
    expect(after.status).toBe('pending')
    expect(after.attempts).toBe(1)
    expect(after.lastStatus).toBe(502)
    expect(after.lastError).toBe('bad gateway')
    expect(after.nextAttemptAt).toBeGreaterThan(Date.now() + RETRY_DELAYS[1] - 100)
  })

  it('markFailed dead-letters after MAX_ATTEMPTS', async () => {
    const s = store
    const row = await enqueue()
    let final = (await s.getById(row.id))!
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const next = await s.markFailed(final.id, { status: 500, error: 'boom' })
      if (!next) break
      final = next
    }
    expect(final.status).toBe('dead')
    expect(final.attempts).toBe(MAX_ATTEMPTS)
  })

  it('replay resets a dead row to pending', async () => {
    const s = store
    const row = await enqueue()
    let final = (await s.getById(row.id))!
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      final = (await s.markFailed(final.id, { status: 500, error: 'x' })) ?? final
    }
    expect(final.status).toBe('dead')
    expect(await s.replay(final.id)).toBe(true)
    const after = (await s.getById(final.id))!
    expect(after.status).toBe('pending')
    expect(after.attempts).toBe(0)
    expect(after.lastError).toBeNull()
  })

  it('listForSubscription returns most recent first, optional status filter', async () => {
    const s = store
    const older = await s.enqueue({
      subscriptionId: 'sub1',
      eventId: 'a',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: '',
    })
    const row2 = await s.enqueue({
      subscriptionId: 'sub1',
      eventId: 'b',
      eventType: 'customer.updated',
      url: 'https://x.test/',
      body: '{}',
      signature: '',
    })
    // Force a deterministic gap: both rows can otherwise land in the same
    // millisecond, and `ORDER BY created_at DESC` ties arbitrarily — which
    // would let a dropped or reversed ORDER BY pass unnoticed with only a
    // length assertion (the original form of this test).
    await handle.kysely
      .updateTable('webhook_deliveries')
      .set({ created_at: Date.now() - 60_000 })
      .where('id', '=', older.id)
      .execute()
    await s.markDelivered(row2.id, 200)
    await s.enqueue({
      subscriptionId: 'sub2',
      eventId: 'c',
      eventType: 'customer.created',
      url: 'https://y.test/',
      body: '{}',
      signature: '',
    })
    const subOne = await s.listForSubscription('sub1')
    expect(subOne.map((r) => r.id)).toEqual([row2.id, older.id])
    expect(await s.listForSubscription('sub1', { status: 'delivered' })).toHaveLength(1)
    expect(await s.listForSubscription('sub2')).toHaveLength(1)
  })

  it('defaults to 50 rows and caps at 200 regardless of how many exist', async () => {
    for (let i = 0; i < 205; i++) {
      await store.enqueue({
        subscriptionId: 'sub-many',
        eventId: `evt-${i}`,
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
    }
    expect(await store.listForSubscription('sub-many')).toHaveLength(50)
    expect(await store.listForSubscription('sub-many', { limit: 10_000 })).toHaveLength(200)
    expect(await store.listForSubscription('sub-many', { limit: 10 })).toHaveLength(10)
  })

  // A6: both the admin and dev webhook-subscription-deliveries routers pass
  // `limit: request.query.limit ? Number(request.query.limit) : undefined` —
  // `?limit=abc` reaches here as `NaN`, with no Zod querystring schema to
  // reject it first. Before the fix, `Math.min(NaN, 200)` was itself `NaN`,
  // and Kysely's `.limit(NaN)` threw `SqliteError: datatype mismatch` (a 500
  // on the public `GET /v1/webhook-subscriptions/:id/deliveries`).
  it('a non-numeric limit does not 500 and falls back to the default (A6)', async () => {
    await store.enqueue({
      subscriptionId: 'sub-a6',
      eventId: 'evt-1',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: '',
    })
    const rows = await store.listForSubscription('sub-a6', { limit: Number('abc') })
    expect(rows).toHaveLength(1)
  })

  // Same class of bug as A6, not the NaN instance but the fractional one:
  // both routers parse with `Number(...)`, not `parseInt`, so `?limit=2.5`
  // reaches here un-truncated. `Number.isFinite(2.5)` is `true`, so a
  // finite-only guard would have let it through to `.limit(2.5)`, and
  // SQLite's `OP_MustBeInt` rejects a non-integral value with the identical
  // `SqliteError: datatype mismatch` A6 was. `Number.isInteger` is what
  // actually excludes it.
  it('a fractional limit does not 500 and falls back to the default', async () => {
    await store.enqueue({
      subscriptionId: 'sub-frac',
      eventId: 'evt-1',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: '',
    })
    const rows = await store.listForSubscription('sub-frac', { limit: 2.5 })
    expect(rows).toHaveLength(1)
  })

  describe('offset, sort, filter and count (Plan 3 Part C)', () => {
    // Same shape of bug `EndUserStore.countEndUsers` closed for `/customers`,
    // reproduced here at the store level: admin-api's
    // `/api/webhook-subscriptions/:id/deliveries` used to ask upstream with
    // only `{ status }` and NO `limit`/`offset`, so `listForSubscription`
    // returned its own 50-row default and `meta.total = all.length` was that
    // truncated count — capped at 50 no matter how many deliveries actually
    // existed. 55 seeded rows, with a real COUNT query, must report 55 — not
    // 50 — and the 51st–55th rows must be reachable via `offset`.
    it("is not capped at listForSubscription()'s own default — the 51st (and 55th) delivery is reachable", async () => {
      for (let i = 0; i < 55; i++) {
        await store.enqueue({
          subscriptionId: 'sub-count',
          eventId: `evt-${i}`,
          eventType: 'customer.created',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
      }
      expect(await store.countForSubscription('sub-count')).toBe(55)
      const page1 = await store.listForSubscription('sub-count', { limit: 50, offset: 0 })
      const page2 = await store.listForSubscription('sub-count', { limit: 50, offset: 50 })
      expect(page1).toHaveLength(50)
      // The rows `listForSubscription()`'s old 50-row default made
      // unreachable: page 2 has to exist and carry the remaining 5, or "55
      // total" is a number with nowhere for the extra rows to actually
      // appear.
      expect(page2).toHaveLength(5)
      // No overlap between the two pages — proves `offset` actually moved
      // the window rather than silently being ignored (which would make
      // page 2 identical to page 1).
      const ids1 = new Set(page1.map((r) => r.id))
      expect(page2.every((r) => !ids1.has(r.id))).toBe(true)
    })

    // Guards the reason `deliveryWhere` was factored out in the first place:
    // if a filter were ever added to `listForSubscription()` without also
    // adding it to `countForSubscription()`, `meta.total` would silently
    // disagree with the rows `listForSubscription()` actually returns for
    // the same filter. All THREE `deliveryWhere` clauses are exercised, not
    // just `eventType`: a helper that drops `status` (or `eventId`) out to
    // an inline clause in `listForSubscription()` alone — leaving
    // `countForSubscription()` to silently stop matching it — is exactly
    // the drift this test exists to catch, and an `eventType`-only version
    // of this test would not catch it.
    it('countForSubscription reflects the exact same filter as listForSubscription for every clause, so meta.total cannot drift', async () => {
      const a = await store.enqueue({
        subscriptionId: 'sub-drift',
        eventId: 'evt-alpha',
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const b = await store.enqueue({
        subscriptionId: 'sub-drift',
        eventId: 'evt-beta',
        eventType: 'customer.updated',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      await store.markDelivered(b.id, 200)

      // eventType
      expect(await store.countForSubscription('sub-drift', { eventType: 'created' })).toBe(1)
      expect(
        (await store.listForSubscription('sub-drift', { eventType: 'created' })).map(
          (r) => r.eventType,
        ),
      ).toEqual(['customer.created'])

      // eventId
      expect(await store.countForSubscription('sub-drift', { eventId: 'alpha' })).toBe(1)
      expect(
        (await store.listForSubscription('sub-drift', { eventId: 'alpha' })).map((r) => r.eventId),
      ).toEqual(['evt-alpha'])

      // status
      expect(await store.countForSubscription('sub-drift', { status: 'delivered' })).toBe(1)
      expect(
        (await store.listForSubscription('sub-drift', { status: 'delivered' })).map(
          (r) => r.eventId,
        ),
      ).toEqual(['evt-beta'])
    })

    it('filters by eventType and eventId, case-insensitive substring, combined with status (AND)', async () => {
      await store.enqueue({
        subscriptionId: 'sub-filter',
        eventId: 'EVT-abc',
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const other = await store.enqueue({
        subscriptionId: 'sub-filter',
        eventId: 'evt-xyz',
        eventType: 'customer.updated',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      await store.markDelivered(other.id, 200)

      expect(
        (await store.listForSubscription('sub-filter', { eventType: 'CREATED' })).map(
          (r) => r.eventId,
        ),
      ).toEqual(['EVT-abc'])
      expect(
        (await store.listForSubscription('sub-filter', { eventId: 'ABC' })).map((r) => r.eventId),
      ).toEqual(['EVT-abc'])
      // AND, not OR: a status that doesn't match this event type returns
      // nothing, proving the two clauses combine rather than either alone
      // being sufficient.
      expect(
        await store.listForSubscription('sub-filter', {
          eventType: 'created',
          status: 'delivered',
        }),
      ).toEqual([])
      expect(
        (
          await store.listForSubscription('sub-filter', {
            eventType: 'updated',
            status: 'delivered',
          })
        ).map((r) => r.eventId),
      ).toEqual(['evt-xyz'])
    })

    it('sorts by a requested column, ascending and descending', async () => {
      const a = await store.enqueue({
        subscriptionId: 'sub-sort',
        eventId: 'e-a',
        eventType: 'aaa.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const b = await store.enqueue({
        subscriptionId: 'sub-sort',
        eventId: 'e-b',
        eventType: 'zzz.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const asc = await store.listForSubscription('sub-sort', { sort: 'eventType', dir: 'asc' })
      expect(asc.map((r) => r.id)).toEqual([a.id, b.id])
      const desc = await store.listForSubscription('sub-sort', { sort: 'eventType', dir: 'desc' })
      expect(desc.map((r) => r.id)).toEqual([b.id, a.id])
    })

    /**
     * A real tie ON THE SORT KEY. The test above does not create one — its two
     * rows have distinct event types — so deleting the tiebreaker from the
     * SORTED branch left all 1776 shared tests green. The default branch's own
     * tie test guards a different code path.
     *
     * `status` is the sort column and both rows are `pending`, so the sort key
     * ties outright and only the tiebreaker separates them. The expected order
     * is `created_at DESC, id DESC` — the DEFAULT order — and NOT the
     * requested direction: this store used to break the tie with `id` in the
     * sort direction, and is now unified on the rule `AdminStore.listAudit`
     * and `SyncStore.list` state outright, so an operator flipping `dir` on a
     * column where half the page ties no longer sees rows reshuffle that did
     * not move in the sort at all.
     *
     * `newer` is deliberately the row whose `id` sorts FIRST ascending, so
     * neither `id ASC` nor `id DESC` can produce this answer by coincidence.
     */
    /**
     * A real tie ON THE SORT KEY, constructed so the tiebreaker's EXISTENCE is
     * observable and not only its direction.
     *
     * The first version of this test tied on `status` alone and asserted
     * `created_at DESC`. That pinned the CONVENTION (reverting to
     * `orderBy('id', dir)` went red) but not the tiebreaker's existence:
     * `idx_webhook_deliveries_subscription ON (subscription_id, created_at
     * DESC)` means an unguarded scan ALREADY comes back `created_at DESC`, so
     * deleting the tiebreaker line entirely left the suite green — the
     * expected value was exactly what the guarded-against path returns.
     * `end_users` carries no such index, which is why its sibling bit and this
     * one did not.
     *
     * So all three rows tie on the sort key AND on `created_at`, leaving `id
     * DESC` as the only thing that can order them — and the ids are assigned
     * OPPOSITE to insertion order, so the index's own answer (equal keys, heap
     * / rowid order) is the reverse of the expected one. Deleting the
     * tiebreaker cannot then coincide with the answer on either dialect.
     */
    it('breaks a tie ON THE SORT KEY with the default order, not the sort direction', async () => {
      // Insertion order aaa, mmm, zzz; `id DESC` is zzz, mmm, aaa.
      const ids = ['aaa-tie', 'mmm-tie', 'zzz-tie']
      for (const [i, id] of ids.entries()) {
        const row = await store.enqueue({
          subscriptionId: 'sub-tie',
          eventId: `e-${i}`,
          eventType: 'same.type',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
        await handle.kysely
          .updateTable('webhook_deliveries')
          // One `created_at` for all three: the sort key ties, the default
          // order's first term ties, and only `id DESC` is left.
          .set({ id, created_at: 1_000_000 })
          .where('id', '=', row.id)
          .execute()
      }

      // Both directions give the SAME answer: the tie falls through to the
      // default order, which does not follow `dir`. Under the old convention
      // (`orderBy('id', dir)`) ascending answered aaa, mmm, zzz and descending
      // the reverse — so this asserts both that the two are equal AND what
      // they equal.
      for (const dir of ['asc', 'desc'] as const) {
        const rows = await store.listForSubscription('sub-tie', { sort: 'status', dir })
        expect(rows.map((r) => r.id)).toEqual(['zzz-tie', 'mmm-tie', 'aaa-tie'])
      }

      // And the page boundary falls INSIDE the tie group, which is the
      // page-stability this tiebreaker exists for: without it, LIMIT/OFFSET
      // over an unbroken tie shows a row on two pages or on none.
      const sorted = { sort: 'status', dir: 'asc' as const }
      const page1 = await store.listForSubscription('sub-tie', { ...sorted, limit: 2, offset: 0 })
      const page2 = await store.listForSubscription('sub-tie', { ...sorted, limit: 2, offset: 2 })
      expect(page1.map((r) => r.id)).toEqual(['zzz-tie', 'mmm-tie'])
      expect(page2.map((r) => r.id)).toEqual(['aaa-tie'])
      // Repeatable: the same request twice gives the same slice.
      expect(
        (await store.listForSubscription('sub-tie', { ...sorted, limit: 2, offset: 2 })).map(
          (r) => r.id,
        ),
      ).toEqual(['aaa-tie'])
    })

    // Pins the `lower()` fold-in itself, not just its absence-of-crash: the
    // fixtures before this test all happened to already be lowercase, so
    // stripping `lower()` from the sort entirely would have left every
    // other test in this file passing unchanged. SQLite's BINARY collation
    // sorts uppercase before ALL lowercase (`'Beta.z' < 'Zeta.x' <
    // 'alpha.y'`, byte value), which disagrees with the case-insensitive
    // order (`alpha < Beta < Zeta`) `lower()` on both sides produces —
    // Postgres's default collation already agrees with the case-insensitive
    // order, which is exactly why a regression here is invisible without a
    // mixed-case fixture on SQLite specifically.
    it('sorts eventType case-insensitively, not by SQLite BINARY collation', async () => {
      const zeta = await store.enqueue({
        subscriptionId: 'sub-case',
        eventId: 'e-zeta',
        eventType: 'Zeta.x',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const alpha = await store.enqueue({
        subscriptionId: 'sub-case',
        eventId: 'e-alpha',
        eventType: 'alpha.y',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const beta = await store.enqueue({
        subscriptionId: 'sub-case',
        eventId: 'e-beta',
        eventType: 'Beta.z',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const rows = await store.listForSubscription('sub-case', { sort: 'eventType', dir: 'asc' })
      expect(rows.map((r) => r.id)).toEqual([alpha.id, beta.id, zeta.id])
    })

    /**
     * Every key in the map, pinned. Only `eventType` had a behavioural test
     * before this, and both of its cases seeded `eventId` in the SAME order as
     * `eventType` (`e-a`/`e-b` alongside `aaa.type`/`zzz.type`;
     * `e-zeta`/`e-alpha`/`e-beta` alongside `Zeta.x`/`alpha.y`/`Beta.z`), so
     * repointing `eventType` at its neighbouring `event_id` produced the
     * expected answer anyway. `eventId`, `status` and `attempts` had no
     * behavioural test at all — each could be pointed at another column with
     * all 1776 shared tests green.
     *
     * ONE fixture serves all four. Every column's ascending order is a
     * DIFFERENT permutation of the four rows, and none of them is the default
     * order, so no expected value here is what a broken path returns:
     *
     *   default        A C D B      eventType asc  B D C A
     *   eventId asc    C A D B      attempts asc   D C B A
     *   status asc     C D B A
     *
     * Both text columns are seeded mixed-case, so each also fails if its
     * `lower()` is dropped: under SQLite's BINARY collation `event_type`
     * answers D A B C and `event_id` A B C D.
     *
     * And the two indexes are accounted for, per the rule that an ORDER BY
     * assertion is only load-bearing if no index can already produce the
     * expected order. `idx_webhook_deliveries_subscription (subscription_id,
     * created_at DESC)` produces the default order — which is why no case
     * below equals it. `idx_webhook_deliveries_pending (status,
     * next_attempt_at)` is the one that could serve `sort=status` outright, so
     * the two rows that tie on `status` carry `next_attempt_at` values in the
     * OPPOSITE order to the `created_at DESC` tiebreak: the index's own answer
     * is C B D A, the expected one is C D B A.
     */
    const SORT_FIXTURE = [
      {
        id: 'wd-a',
        event_type: 'Delta.created',
        event_id: 'e-Bravo',
        status: 'pending',
        attempts: 4,
        created_at: 400,
        next_attempt_at: 40,
      },
      {
        id: 'wd-b',
        event_type: 'alpha.created',
        event_id: 'e-Delta',
        status: 'delivered',
        attempts: 3,
        created_at: 100,
        next_attempt_at: 10,
      },
      {
        id: 'wd-c',
        event_type: 'charlie.created',
        event_id: 'e-alpha',
        status: 'dead',
        attempts: 2,
        created_at: 300,
        next_attempt_at: 30,
      },
      {
        id: 'wd-d',
        event_type: 'Bravo.created',
        event_id: 'e-charlie',
        status: 'delivered',
        attempts: 1,
        created_at: 200,
        next_attempt_at: 20,
      },
    ]

    /**
     * Inserted straight through Kysely rather than `enqueue()`, which mints a
     * `randomUUID` id, stamps `created_at` with `Date.now()` and always writes
     * `status: 'pending'`/`attempts: 0` — none of which an ordering assertion
     * can work with.
     */
    async function seedSortFixture(): Promise<void> {
      for (const row of SORT_FIXTURE) {
        await handle.kysely
          .insertInto('webhook_deliveries')
          .values({
            ...row,
            subscription_id: 'sub-map',
            url: 'https://x.test/',
            body: '{}',
            signature: '',
            delivered_at: null,
            last_status: null,
            last_error: null,
          })
          .execute()
      }
    }

    it('offers exactly the four UI sort keys, each on the column it claims', () => {
      expect(WEBHOOK_DELIVERY_SORT_COLUMNS).toEqual({
        eventType: 'event_type',
        eventId: 'event_id',
        status: 'status',
        attempts: 'attempts',
      })
    })

    /**
     * The behavioural half of the same guard. Both directions are written out
     * per case rather than derived — `status` in particular is NOT the reverse
     * of its own ascending answer, because the tie between the two `delivered`
     * rows falls through to `created_at DESC` in both directions.
     */
    it.each([
      {
        key: 'eventType',
        asc: ['wd-b', 'wd-d', 'wd-c', 'wd-a'],
        desc: ['wd-a', 'wd-c', 'wd-d', 'wd-b'],
      },
      {
        key: 'eventId',
        asc: ['wd-c', 'wd-a', 'wd-d', 'wd-b'],
        desc: ['wd-b', 'wd-d', 'wd-a', 'wd-c'],
      },
      {
        key: 'status',
        asc: ['wd-c', 'wd-d', 'wd-b', 'wd-a'],
        desc: ['wd-a', 'wd-d', 'wd-b', 'wd-c'],
      },
      {
        key: 'attempts',
        asc: ['wd-d', 'wd-c', 'wd-b', 'wd-a'],
        desc: ['wd-a', 'wd-b', 'wd-c', 'wd-d'],
      },
    ])('sorts by $key on its own column, not a neighbouring one', async ({ key, asc, desc }) => {
      await seedSortFixture()
      expect(
        (await store.listForSubscription('sub-map', { sort: key, dir: 'asc' })).map((r) => r.id),
      ).toEqual(asc)
      expect(
        (await store.listForSubscription('sub-map', { sort: key, dir: 'desc' })).map((r) => r.id),
      ).toEqual(desc)
    })

    // The order every case above has to differ from, so none of them can be
    // satisfied by the sort being dropped altogether.
    it('answers the same fixture in created_at DESC, id DESC order with no sort', async () => {
      await seedSortFixture()
      expect((await store.listForSubscription('sub-map')).map((r) => r.id)).toEqual([
        'wd-a',
        'wd-c',
        'wd-d',
        'wd-b',
      ])
    })

    // The default order, `created_at DESC`, ties on a burst of retries or a
    // scripted replay — `created_at` is `Date.now()` epoch-ms, and forcing
    // the tie makes the assertion fail deterministically pre-fix rather than
    // only on unlucky timing.
    it('breaks a created_at tie by id DESC, deterministically', async () => {
      const first = await store.enqueue({
        subscriptionId: 'sub-tie',
        eventId: 'e1',
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const second = await store.enqueue({
        subscriptionId: 'sub-tie',
        eventId: 'e2',
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      // Rewrite both rows' PRIMARY KEY ids to opposite ends of the
      // lexicographic range and force an exact `created_at` tie. `first`'s
      // physical insertion order (its SQLite rowid, unaffected by this
      // UPDATE since only non-rowid columns change) is OPPOSITE its `id
      // DESC` position: `first` was enqueued before `second`, but
      // `'zzz-tiebreak' > 'aaa-tiebreak'` puts `second` first under `id
      // DESC`. A comparator that dropped the `id` tiebreak and fell back to
      // whatever incidental order the tied rows come back in would return
      // `first` ahead of `second` here — the reverse of this assertion.
      await handle.kysely
        .updateTable('webhook_deliveries')
        .set({ id: 'aaa-tiebreak', created_at: 1_000_000 })
        .where('id', '=', first.id)
        .execute()
      await handle.kysely
        .updateTable('webhook_deliveries')
        .set({ id: 'zzz-tiebreak', created_at: 1_000_000 })
        .where('id', '=', second.id)
        .execute()

      const rows = await store.listForSubscription('sub-tie')
      expect(rows.map((r) => r.id)).toEqual(['zzz-tiebreak', 'aaa-tiebreak'])
    })

    /**
     * An unrecognised sort key falls back to the default order, and the ORDER
     * BY is observable rather than merely "not a 500".
     *
     * The previous fixture could not see the ordering at all: two rows, the
     * older one back-dated, expecting `newer, older` — which is exactly what
     * `idx_webhook_deliveries_subscription ON (subscription_id, created_at
     * DESC)` returns from an UNGUARDED scan, so deleting the default branch's
     * whole `ORDER BY` left it green on both dialects. (`EXPLAIN QUERY PLAN`:
     * `SEARCH webhook_deliveries USING INDEX
     * idx_webhook_deliveries_subscription (subscription_id=?)`. On Postgres
     * the same answer arrives by a different route — the fixture's own UPDATE
     * relocates the older tuple to the heap tail.)
     *
     * This is the same defect the test twenty lines above had, and it has
     * history: this file's version was introduced in `ad49638fa` and
     * STRENGTHENED in `8010005a4` as the repair of the `EndUserStore` gap,
     * where two rows and a forced `created_at` gap genuinely were enough —
     * `end_users` carries no index that can supply the order. An index-backed
     * table defeats that repair silently.
     *
     * So the expected order is one no index can produce: three rows tying on
     * `created_at`, with ids assigned OPPOSITE to insertion order, leaving
     * `id DESC` as the only thing that can order them. Every candidate
     * scan order — index (equal keys, then rowid/heap) and insertion — is the
     * reverse of the answer.
     */
    it('falls back to the default order for an unrecognised sort key, not a 500', async () => {
      // Insertion order aaa, mmm, zzz; `id DESC` is zzz, mmm, aaa.
      for (const [i, id] of ['aaa-badsort', 'mmm-badsort', 'zzz-badsort'].entries()) {
        const row = await store.enqueue({
          subscriptionId: 'sub-badsort',
          eventId: `e${i}`,
          eventType: 'customer.created',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
        await handle.kysely
          .updateTable('webhook_deliveries')
          .set({ id, created_at: 1_000_000 })
          .where('id', '=', row.id)
          .execute()
      }
      const rows = await store.listForSubscription('sub-badsort', { sort: 'not_a_real_column' })
      expect(rows.map((r) => r.id)).toEqual(['zzz-badsort', 'mmm-badsort', 'aaa-badsort'])

      // And a DISTINCT `created_at` still orders newest-first, so the tie
      // fixture above has not quietly replaced the `created_at DESC` claim
      // with an `id DESC`-only one.
      await handle.kysely
        .updateTable('webhook_deliveries')
        .set({ created_at: 9_000_000 })
        .where('id', '=', 'aaa-badsort')
        .execute()
      const bumped = await store.listForSubscription('sub-badsort', { sort: 'not_a_real_column' })
      expect(bumped.map((r) => r.id)).toEqual(['aaa-badsort', 'zzz-badsort', 'mmm-badsort'])
    })

    /**
     * The `Object.prototype` half of the same allow-list, which had NO test in
     * this file — `EndUserStore`, `AdminStore.listAudit` and admin-api's
     * connections route each have one, and this store was the odd man out.
     * Swapping `WEBHOOK_DELIVERY_SORT_KEYS.has(opts.sort)` for
     * `opts.sort in WEBHOOK_DELIVERY_SORT_COLUMNS` left the whole shared suite
     * green, and the hazard is not hypothetical: `in` also matches
     * `Object.prototype`, so `?sort=constructor` resolves to the `Object`
     * constructor rather than a column name and Kysely throws
     * `TypeError: exp(...).toOperationNode is not a function` — a 500 on the
     * public `GET /v1/webhook-subscriptions/:id/deliveries` reachable by
     * hand-editing a URL.
     *
     * `not_a_real_column` above cannot catch it: `in` correctly rejects a key
     * that is not on the prototype chain either. Only a real prototype key
     * exercises the bug, and `'constructor'`/`'valueOf'` are the two that
     * resolve to something callable.
     *
     * The same index-proof fixture as above: three rows tied on `created_at`
     * with ids assigned OPPOSITE to insertion order, so the expected answer is
     * one no scan order can produce on its own.
     */
    it.each([
      ['a prototype method', 'constructor'],
      ['a prototype key', '__proto__'],
      ['a prototype value method', 'valueOf'],
      ['the deprecated "col dir" string form', 'created_at desc'],
      ['a physical column name that is not a UI key', 'event_type'],
    ])('falls back to the default order on %s, without throwing', async (_label, key) => {
      for (const [i, id] of ['aaa-proto', 'mmm-proto', 'zzz-proto'].entries()) {
        const row = await store.enqueue({
          subscriptionId: 'sub-proto',
          eventId: `e${i}`,
          eventType: 'customer.created',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
        await handle.kysely
          .updateTable('webhook_deliveries')
          .set({ id, created_at: 1_000_000 })
          .where('id', '=', row.id)
          .execute()
      }
      const rows = await store.listForSubscription('sub-proto', { sort: key, dir: 'asc' })
      expect(rows.map((r) => r.id)).toEqual(['zzz-proto', 'mmm-proto', 'aaa-proto'])
    })

    // Same class of bug as A6/the fractional-limit test above, applied to
    // the new `offset` field: `?offset=abc` reaches here as `NaN` via
    // `Number(...)`, and `?offset=0.5` reaches here un-truncated.
    // `Number.isInteger` excludes both, collapsing to offset 0 (page one)
    // rather than throwing `SqliteError: datatype mismatch`.
    it('a non-numeric or fractional offset does not throw and falls back to 0', async () => {
      await store.enqueue({
        subscriptionId: 'sub-offset-bad',
        eventId: 'e1',
        eventType: 'customer.created',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      await expect(
        store.listForSubscription('sub-offset-bad', { offset: Number('abc') }),
      ).resolves.toHaveLength(1)
      await expect(
        store.listForSubscription('sub-offset-bad', { offset: 0.5 }),
      ).resolves.toHaveLength(1)
    })
  })

  describe('non-retryable responses', () => {
    async function enqueueOne() {
      return store.enqueue({
        subscriptionId: 'sub1',
        eventId: 'evt-' + Math.random().toString(36).slice(2, 10),
        eventType: 'customer.created',
        url: 'https://example.test/hook',
        body: '{}',
        signature: 'sha256=abc',
      })
    }

    // A receiver that rejects the payload will reject it identically on
    // attempt 8. Slack answers 400 invalid_payload to a body it cannot parse,
    // and burning the full ladder on it just delays the operator finding out.
    it.each([400, 401, 403, 404, 405, 406, 410, 413, 414, 415, 422, 501])(
      'dies on the first attempt for %i',
      async (status) => {
        const d = await enqueueOne()
        const after = await store.markFailed(d.id, { status, error: `HTTP ${status}` })
        expect(after?.status).toBe('dead')
        expect(after?.attempts).toBe(1)
        expect(after?.lastStatus).toBe(status)
        expect(after?.lastError).toMatch(/not retr/i)
      },
    )

    it.each([408, 425, 429, 500, 502, 503])('keeps retrying %i', async (status) => {
      const d = await enqueueOne()
      const after = await store.markFailed(d.id, { status, error: `HTTP ${status}` })
      expect(after?.status).toBe('pending')
      expect(after?.attempts).toBe(1)
    })

    it('keeps retrying a network error, which has no status', async () => {
      const d = await enqueueOne()
      const after = await store.markFailed(d.id, { status: null, error: 'network down' })
      expect(after?.status).toBe('pending')
    })

    it('can still be replayed manually after dying early', async () => {
      // The operator fixes the receiver, then replays — the escape hatch has
      // to survive the early death or a 400 becomes unrecoverable.
      const d = await enqueueOne()
      await store.markFailed(d.id, { status: 400, error: 'HTTP 400' })
      expect(await store.replay(d.id)).toBe(true)
      const [pending] = await store.nextBatch(10, Date.now() + 1_000)
      expect(pending?.id).toBe(d.id)
    })
  })
})
