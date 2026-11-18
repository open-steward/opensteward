/**
 * `SyncStore.list`'s paging, ordering and per-column filtering, on both
 * dialects — and `SyncStore.count`, which is what makes the paging honest.
 *
 * `/sync-jobs` is the one admin table where the paging genuinely HAD to move
 * to the store. admin-api used to ask upstream for `Math.min(page * limit + 1,
 * 200)` rows and slice locally, so the whole table was hard-capped at 200 rows
 * / 4 pages and row 201 was unreachable at any page size, while `meta.total`
 * reported the size of that window rather than a total.
 *
 * Three things are pinned here that a passing suite would otherwise say
 * nothing about:
 *
 *  1. **The allow-list.** A caller-supplied key must never reach `orderBy`.
 *     `DbSchema` is `Record<string, any>`, so TypeScript catches nothing, and
 *     Kysely quotes identifiers, so this is not an injection vector — it is a
 *     500 vector. Kysely 0.29.4 still parses the deprecated `'col dir'` string
 *     form, so `sort=created_at desc` throws `Cannot specify direction twice!`,
 *     and `sort=__proto__` throws `no such column`.
 *  2. **The two dialect divergences,** and the fact that each modifier is
 *     applied only where the schema needs it. `tenant_id` is the one sort
 *     column that is both nullable and caller-supplied free text, so it is the
 *     only one carrying `lower()` and `.nullsLast()`.
 *  3. **The tiebreaker.** Postgres gives no implicit row order on equal keys,
 *     so an unbroken tie under LIMIT/OFFSET shows a row on two pages or on
 *     none — and `created_at` is `Date.now()` epoch-ms, which ties on any bulk
 *     enqueue.
 *
 * On the case-folding test, note WHICH backend does the catching. Dropping
 * `lower()` fails on SQLite outright (BINARY collation puts `'Charlie'` before
 * `'bravo'`); a default `postgres:*-alpine` sorts by byte order too, because
 * musl has no locale data and libc collation falls back to byte comparison, so
 * CI's Postgres agrees with SQLite here. That is why the assertion states the
 * case-insensitive order outright rather than comparing the two backends to
 * each other. For NULLs the split is real on any image: SQLite catches a
 * dropped `.nullsLast()` on ASC and Postgres on DESC, since each dialect's
 * default already agrees with the pinned answer in the other direction. Both
 * directions are asserted so that whichever backend runs, one of them bites.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { SyncStore, SYNC_SORT_COLUMNS, isSyncSortKey } from '../../src/data-store/sync-store'

// SQLite always (`:memory:` is fresh per open); Postgres when
// TEST_DATABASE_URL is set. Same harness as sync-store.test.ts beside it.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

interface SeedRow {
  id: string
  vertical?: string
  connection_id?: string
  platform?: string
  tenant_id?: string | null
  status?: string
  created_at?: number
}

describe.each(BACKENDS)('SyncStore list/count [$name]', (backend) => {
  let handle: DbHandle
  let store: SyncStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await SyncStore.create(handle)
  })

  afterEach(async () => {
    await handle?.close()
  })

  /**
   * Insert straight through Kysely rather than `store.create()`, which mints a
   * `randomUUID` id and stamps `created_at` with `Date.now()`. Every ordering
   * assertion below needs both to be known values — and the `id` tiebreaker
   * cannot be pinned at all against random ids.
   */
  async function seed(rows: SeedRow[]): Promise<void> {
    let t = 1_700_000_000_000
    for (const r of rows) {
      await handle.kysely
        .insertInto('sync_jobs')
        .values({
          id: r.id,
          vertical: r.vertical ?? 'accounting',
          // Distinct by default: one connection may hold only one active job
          // (idx_sync_jobs_one_active), and these rows default to 'pending'.
          connection_id: r.connection_id ?? `conn-${r.id}`,
          platform: r.platform ?? 'fortnox',
          tenant_id: r.tenant_id === undefined ? null : r.tenant_id,
          status: r.status ?? 'pending',
          progress: null,
          error: null,
          callback_url: null,
          created_at: r.created_at ?? t++,
        })
        .execute()
    }
  }

  const ids = (jobs: Array<{ id: string }>) => jobs.map((j) => j.id)

  /**
   * One fixture for every sort key. Each column's ascending order is a
   * DIFFERENT permutation of the four rows, and none of them equals the
   * default order (`created_at DESC, id DESC` = A, C, D, B) — so a test's
   * expected value can never be what the broken code returns, whether the
   * break is a map entry pointed at a neighbouring column or the sort being
   * dropped entirely.
   *
   *   default      A C D B      vertical asc    B A D C
   *   created asc  B D C A      platform asc    C B A D
   *   status asc   C A D B      connection asc  D C B A
   *   tenant asc   A D B C  (case-insensitively; BINARY gives A B D C)
   */
  const FIXTURE: SeedRow[] = [
    {
      id: 'j-a',
      vertical: 'crm',
      platform: 'shopify',
      connection_id: 'c-4',
      tenant_id: 'Alpha',
      status: 'failed',
      created_at: 400,
    },
    {
      id: 'j-b',
      vertical: 'accounting',
      platform: 'fortnox',
      connection_id: 'c-3',
      tenant_id: 'Charlie',
      status: 'running',
      created_at: 100,
    },
    {
      id: 'j-c',
      vertical: 'logistics',
      platform: 'asana',
      connection_id: 'c-2',
      tenant_id: 'delta',
      status: 'completed',
      created_at: 300,
    },
    {
      id: 'j-d',
      vertical: 'ecommerce',
      platform: 'zoho',
      connection_id: 'c-1',
      tenant_id: 'bravo',
      status: 'pending',
      created_at: 200,
    },
  ]

  // ── Paging ────────────────────────────────────────────────────────────────

  /**
   * The live bug. Against the pre-change store this returns the SAME first 50
   * rows for both calls: `list()` had no `offset` at all, so admin-api paged
   * locally over a window it could only widen to 200.
   */
  it('reaches past the first page with an offset — rows 51+ were unreachable', async () => {
    await seed(
      Array.from({ length: 60 }, (_, i) => ({
        id: `j-${String(i).padStart(2, '0')}`,
        created_at: 1000 + i,
      })),
    )
    const first = await store.list({ limit: 50 })
    const second = await store.list({ limit: 50, offset: 50 })
    expect(first).toHaveLength(50)
    expect(second).toHaveLength(10)
    // Default order is newest-first, so the second page is the ten oldest.
    expect(ids(second)).toEqual([
      'j-09',
      'j-08',
      'j-07',
      'j-06',
      'j-05',
      'j-04',
      'j-03',
      'j-02',
      'j-01',
      'j-00',
    ])
    // And the two pages partition the set: no row on both, none missed.
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(60)
  })

  it('collapses a fractional, negative or NaN offset to 0 rather than throwing', async () => {
    await seed(FIXTURE)
    // `Number.isFinite(2.5)` is true, and 2.5 reaches SQLite's `OP_MustBeInt`
    // as `SqliteError: datatype mismatch` — a 500. `Number.isInteger` is what
    // closes it, here as in every sibling store.
    expect(ids(await store.list({ offset: 2.5 }))).toEqual(['j-a', 'j-c', 'j-d', 'j-b'])
    expect(ids(await store.list({ offset: -5 }))).toEqual(['j-a', 'j-c', 'j-d', 'j-b'])
    expect(ids(await store.list({ offset: NaN }))).toEqual(['j-a', 'j-c', 'j-d', 'j-b'])
    // Sanity: a real offset still moves the window, so the three above are not
    // passing because offsets are ignored altogether.
    expect(ids(await store.list({ offset: 2 }))).toEqual(['j-d', 'j-b'])
  })

  // ── count() ───────────────────────────────────────────────────────────────

  /**
   * `count` and `list` go through the SAME `syncWhere`, so they cannot
   * disagree about which rows match. A filter added to `list` alone would page
   * over a narrowed set while `meta.total` counted the whole table.
   *
   * The limit is deliberately larger than the fixture on every case: this
   * asserts count == the number of MATCHING rows, not count == the page size.
   */
  it.each([
    { label: 'no filter', filter: {}, expected: 4 },
    { label: 'a vertical', filter: { vertical: 'crm' }, expected: 1 },
    { label: 'a platform substring', filter: { platform: 'o' }, expected: 3 },
    { label: 'a status', filter: { status: 'failed' }, expected: 1 },
    // Every WHERE field gets a row here, not a representative sample: moving
    // ANY ONE of them out of `syncWhere` into `list` alone is the Part C bug,
    // and `tenantId`/`idContains` were the two this table originally missed —
    // both mutations left all 78 shared sync tests green. The operator-visible
    // failure is `?f_tenant=acme` showing 12 jobs while `meta.total` counts
    // 4,000, so `_pagination` offers 80 pages of which 79 are blank.
    { label: 'a tenant id', filter: { tenantId: 'Charlie' }, expected: 1 },
    { label: 'an id substring', filter: { idContains: 'j-a' }, expected: 1 },
    { label: 'a connection id', filter: { connectionId: 'c-2' }, expected: 1 },
    // 'c-1', not the 'c-' every row shares: an expected value of 4 is also
    // what a MISSING clause returns, which is the decorative-assertion trap.
    { label: 'a connection id substring', filter: { connectionIdContains: 'c-1' }, expected: 1 },
    { label: 'a filter that matches nothing', filter: { vertical: 'nope' }, expected: 0 },
  ])('count agrees with list under $label', async ({ filter, expected }) => {
    await seed(FIXTURE)
    expect(await store.count(filter)).toBe(expected)
    expect(await store.list({ ...filter, limit: 200 })).toHaveLength(expected)
  })

  it('counts every matching row, not just the page in hand', async () => {
    await seed(
      Array.from({ length: 60 }, (_, i) => ({ id: `j-${String(i).padStart(2, '0')}` })),
    )
    // The page is 50 (the store's own default ceiling for an omitted limit);
    // the count is not.
    expect(await store.list({})).toHaveLength(50)
    expect(await store.count()).toBe(60)
  })

  // ── Filters ───────────────────────────────────────────────────────────────

  /**
   * The ownership guard. `connectionId` is EXACT because
   * `GET /v1/{vertical}/sync` scopes a Bearer caller to their own connection
   * with it — a substring match there would let one caller's id prefix pull
   * back another caller's jobs. `connectionIdContains` is the separate,
   * admin-only substring field.
   */
  it('matches connectionId EXACTLY, never as a prefix of a longer id', async () => {
    // The third row is what keeps the `connectionIdContains` assertion below
    // honest: with two rows, "both of them" is also what a MISSING substring
    // clause returns, so the expected value would be the broken answer.
    await seed([
      { id: 'j-own', connection_id: 'c-1' },
      { id: 'j-other', connection_id: 'c-1-extended' },
      { id: 'j-elsewhere', connection_id: 'd-9' },
    ])
    expect(ids(await store.list({ connectionId: 'c-1' }))).toEqual(['j-own'])
    expect(await store.count({ connectionId: 'c-1' })).toBe(1)
    // The admin-only field is the one that widens — to the two rows sharing
    // the stem, and no further.
    expect(ids(await store.list({ connectionIdContains: 'c-1' })).sort()).toEqual([
      'j-other',
      'j-own',
    ])
    expect(await store.count({ connectionIdContains: 'c-1' })).toBe(2)
  })

  /**
   * Which backend catches what, for the three case-insensitive text filters
   * below.
   *
   * Each is `lower(col) LIKE lower(needle)`, and BOTH halves have to be
   * exercised, which takes a fixture that is mixed-case on both sides: an
   * all-lowercase COLUMN makes the column-side `lower()` deletable with
   * everything green, and an all-lowercase NEEDLE does the same for the
   * needle-side `.toLowerCase()`. Every case below therefore has a mixed-case
   * stored value AND a needle whose case differs from it.
   *
   * SQLite still cannot see either half: its `LIKE` is already
   * case-insensitive for ASCII, so dropping either leaves the SQLite run
   * green — and `lower()` in SQLite is ASCII-only too, so no fixture can
   * distinguish them there. Postgres's `LIKE` is case-sensitive and catches
   * both, and CI runs this file against both backends
   * (`.github/workflows/test.yml`, `TEST_DATABASE_URL`). What SQLite does
   * catch is the clause going missing altogether or turning into an exact
   * match, which is why each case also has a needle whose non-matching row
   * must be excluded.
   */
  it('matches platform as a case-insensitive substring, in both directions of case', async () => {
    await seed([
      // Mixed-case stored value: without it the column-side `lower()` is a
      // no-op on every dialect and deletes green.
      { id: 'j-1', platform: 'FortNox' },
      { id: 'j-2', platform: 'shopify' },
    ])
    // Lowercase needle against an upper-cased column…
    expect(ids(await store.list({ platform: 'ortn' }))).toEqual(['j-1'])
    // …and an upper-cased needle against a lowercase column.
    expect(ids(await store.list({ platform: 'SHOP' }))).toEqual(['j-2'])
    expect(ids(await store.list({ platform: 'nope' }))).toEqual([])
  })

  it('matches idContains and connectionIdContains as case-insensitive substrings', async () => {
    await seed([
      { id: 'JOB-abc', connection_id: 'Conn-Alpha', tenant_id: 'acme' },
      { id: 'job-xyz', connection_id: 'conn-beta', tenant_id: 'acme-eu' },
    ])
    expect(ids(await store.list({ idContains: 'ABC' }))).toEqual(['JOB-abc'])
    expect(ids(await store.list({ idContains: 'xyz' }))).toEqual(['job-xyz'])
    expect(ids(await store.list({ idContains: 'job-' })).sort()).toEqual(['JOB-abc', 'job-xyz'])
    // Same pair of directions for the connection-id substring, whose fixture
    // was previously all lowercase — both halves of its `lower()` deleted
    // green.
    expect(ids(await store.list({ connectionIdContains: 'alpha' }))).toEqual(['JOB-abc'])
    expect(ids(await store.list({ connectionIdContains: 'BETA' }))).toEqual(['job-xyz'])
  })

  it('matches tenantId exactly', async () => {
    await seed([
      { id: 'JOB-abc', tenant_id: 'acme' },
      { id: 'job-xyz', tenant_id: 'acme-eu' },
    ])
    // Exact: 'acme' must not pull back 'acme-eu'.
    expect(ids(await store.list({ tenantId: 'acme' }))).toEqual(['JOB-abc'])
  })

  // ── The sort allow-list ───────────────────────────────────────────────────

  /**
   * The whole map, pinned literally. `SYNC_SORT_COLUMNS` is the one place a UI
   * key becomes a physical column, and nothing else in the codebase would
   * notice a wrong entry: `DbSchema` is `Record<string, any>`, so `status`
   * could be pointed at `platform` and still compile, still run, and still
   * return a plausible-looking page.
   */
  it('maps each UI key to the physical column it claims', () => {
    expect(SYNC_SORT_COLUMNS).toEqual({
      vertical: 'vertical',
      platform: 'platform',
      connection: 'connection_id',
      tenant: 'tenant_id',
      status: 'status',
      created: 'created_at',
    })
    for (const key of Object.keys(SYNC_SORT_COLUMNS)) expect(isSyncSortKey(key)).toBe(true)
  })

  /**
   * The behavioural half of the same guard. The expected order is written out
   * per case rather than derived from `SYNC_SORT_COLUMNS[key]` — deriving it
   * would move the assertion along with the bug and leave every backend green,
   * which is exactly how /audit's first version of this test failed to bite.
   * See FIXTURE above for why every one of these differs from every other and
   * from the default.
   */
  it.each([
    { key: 'vertical', expected: ['j-b', 'j-a', 'j-d', 'j-c'] },
    { key: 'platform', expected: ['j-c', 'j-b', 'j-a', 'j-d'] },
    { key: 'connection', expected: ['j-d', 'j-c', 'j-b', 'j-a'] },
    { key: 'tenant', expected: ['j-a', 'j-d', 'j-b', 'j-c'] },
    { key: 'status', expected: ['j-c', 'j-a', 'j-d', 'j-b'] },
    { key: 'created', expected: ['j-b', 'j-d', 'j-c', 'j-a'] },
  ])('sorts by $key on its own column, not a neighbouring one', async ({ key, expected }) => {
    await seed(FIXTURE)
    expect(ids(await store.list({ sort: key, dir: 'asc' }))).toEqual(expected)
    expect(ids(await store.list({ sort: key, dir: 'desc' }))).toEqual([...expected].reverse())
  })

  it('orders newest first with an id tiebreaker when no sort is given', async () => {
    await seed(FIXTURE)
    expect(ids(await store.list({}))).toEqual(['j-a', 'j-c', 'j-d', 'j-b'])
  })

  // The two values that make Kysely THROW rather than merely mis-sort, plus
  // the shapes that would resolve through `Object.prototype` under a bare
  // `in`. All are reachable by hand-editing a URL.
  it.each([
    ['the deprecated "col dir" string form', 'created_at desc'],
    ['a prototype key', '__proto__'],
    ['a prototype method', 'constructor'],
    ['a physical column name that is not a UI key', 'connection_id'],
    ['a column that exists but is not sortable', 'progress'],
  ])('falls back to the default order on %s, without throwing', async (_label, key) => {
    await seed(FIXTURE)
    expect(ids(await store.list({ sort: key, dir: 'asc' }))).toEqual(['j-a', 'j-c', 'j-d', 'j-b'])
    expect(isSyncSortKey(key)).toBe(false)
  })

  /**
   * `tenant_id` is the ONE sort column that is caller-supplied free text of
   * arbitrary case, so it is the one that gets `lower()`. These seed values
   * order differently under SQLite's BINARY collation ('Alpha' < 'Charlie' <
   * 'bravo' < 'delta', by byte value) than case-insensitively ('Alpha' <
   * 'bravo' < 'Charlie' < 'delta') — which is what makes this fail if the
   * `lower()` is removed. Deliberately NOT applied to the other five columns:
   * see `list()`'s per-column note for why each is a closed lowercase
   * vocabulary and what an index costs there.
   */
  it('orders tenant case-insensitively, so both dialects answer the same way', async () => {
    await seed(FIXTURE)
    expect(ids(await store.list({ sort: 'tenant', dir: 'asc' }))).toEqual([
      'j-a',
      'j-d',
      'j-b',
      'j-c',
    ])
    expect(ids(await store.list({ sort: 'tenant', dir: 'desc' }))).toEqual([
      'j-c',
      'j-b',
      'j-d',
      'j-a',
    ])
  })

  /**
   * `tenant_id` is the only NULLABLE sort column, pinned to NULLs LAST in BOTH
   * directions — the rule `table-controls.ts`'s in-memory sort already applies
   * ("Absent values sort last in BOTH directions"). SQLite defaults to NULLs
   * first on ASC and Postgres to NULLs first on DESC, so each direction is
   * load-bearing on one backend.
   *
   * The `created_at` values are deliberately NOT in the same order as the
   * tenants they sit on, so ordering on the wrong column — or dropping the
   * sort entirely — cannot produce the expected answer by accident.
   */
  it('sorts a job with no tenant LAST, ascending and descending', async () => {
    await seed([
      { id: 'j-mid', tenant_id: 'mike', created_at: 100 },
      { id: 'j-none', tenant_id: null, created_at: 400 },
      { id: 'j-low', tenant_id: 'alpha', created_at: 200 },
    ])
    expect(ids(await store.list({ sort: 'tenant', dir: 'asc' }))).toEqual([
      'j-low',
      'j-mid',
      'j-none',
    ])
    expect(ids(await store.list({ sort: 'tenant', dir: 'desc' }))).toEqual([
      'j-mid',
      'j-low',
      'j-none',
    ])
  })

  /**
   * Rows that tie on the sort key fall through to the SAME default ordering
   * the table has with no sort at all — `created_at DESC, id DESC`, never the
   * requested direction. The exact order is asserted, not merely that pages do
   * not overlap: with four rows and no tiebreaker at all both dialects still
   * happen to return them in insertion order here, so a "no repeats, no gaps"
   * assertion would pass against a query with no deterministic order.
   */
  it('breaks a tie on the sort key with created_at DESC, not the sort direction', async () => {
    await seed([
      { id: 'j-1', status: 'pending', created_at: 100 },
      { id: 'j-2', status: 'pending', created_at: 300 },
      { id: 'j-3', status: 'pending', created_at: 200 },
    ])
    expect(ids(await store.list({ sort: 'status', dir: 'asc' }))).toEqual(['j-2', 'j-3', 'j-1'])
  })

  /**
   * Every row here ties on the sort key AND on `created_at`, so only the `id`
   * tiebreaker separates them — and it is what keeps OFFSET paging from
   * showing a row on two pages or on none, on Postgres in particular where
   * equal keys have no implicit order. `created_at` is `Date.now()` epoch-ms,
   * so a bulk enqueue produces exactly this.
   */
  it('pages a fully tied set deterministically, by id DESC', async () => {
    await seed([
      { id: 'j-1', created_at: 500 },
      { id: 'j-2', created_at: 500 },
      { id: 'j-3', created_at: 500 },
      { id: 'j-4', created_at: 500 },
    ])
    expect(ids(await store.list({ limit: 4 }))).toEqual(['j-4', 'j-3', 'j-2', 'j-1'])
    // The pages line up with that whole: no row on two pages or on none.
    expect(ids(await store.list({ limit: 2, offset: 0 }))).toEqual(['j-4', 'j-3'])
    expect(ids(await store.list({ limit: 2, offset: 2 }))).toEqual(['j-2', 'j-1'])
    // Repeatable: the same request twice gives the same slice.
    expect(ids(await store.list({ limit: 2, offset: 2 }))).toEqual(['j-2', 'j-1'])
    // And under an explicit sort the tie falls through to the same order —
    // for BOTH branches of the ordering code. `status` exercises the
    // "primary, then created_at DESC, then id DESC" branch; `created`
    // exercises the separate branch that emits `created_at` once and appends
    // `id DESC` itself, whose tiebreaker is otherwise deletable with
    // everything green. Note `created` is asked for ASCENDING here, so the
    // rows are tied on the primary key while the requested direction is the
    // OPPOSITE of the `id DESC` tiebreaker — a tiebreaker that followed the
    // sort direction would answer j-1..j-4.
    for (const sorted of [
      { sort: 'status', dir: 'asc' as const },
      { sort: 'created', dir: 'asc' as const },
    ]) {
      expect(ids(await store.list({ ...sorted, limit: 4 }))).toEqual(['j-4', 'j-3', 'j-2', 'j-1'])
      expect(ids(await store.list({ ...sorted, limit: 2, offset: 0 }))).toEqual(['j-4', 'j-3'])
      expect(ids(await store.list({ ...sorted, limit: 2, offset: 2 }))).toEqual(['j-2', 'j-1'])
    }
  })
})
