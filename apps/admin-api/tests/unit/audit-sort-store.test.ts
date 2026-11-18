/**
 * `AdminStore.listAudit`'s SQL ordering, on both dialects.
 *
 * `/audit` is the only admin table with true SQL pagination — tens of
 * thousands of rows, LIMIT/OFFSET at the store, an honest `countAudit` — so
 * the sort has to go into the query. Sorting the returned page instead would
 * reorder 50 rows out of 40,000 while the pagination control kept claiming to
 * speak for the whole log.
 *
 * Three things are pinned here that a passing suite would otherwise say
 * nothing about:
 *
 *  1. **The allow-list.** A caller-supplied key must never reach `orderBy`.
 *     `DbSchema` is `Record<string, any>`, so TypeScript catches nothing, and
 *     Kysely quotes identifiers, so this is not an injection vector — it is a
 *     500 vector. Kysely 0.29.4 still parses the deprecated `'col dir'` string
 *     form, so `sort=created_at desc` throws `Cannot specify direction twice!`,
 *     and `sort=__proto__` throws `no such column`. Both are unhandled 500s
 *     reachable by hand-editing a URL.
 *  2. **The two dialect divergences.** SQLite collates TEXT by BINARY
 *     comparison (`'Zebra' < 'apple'`) where Postgres collates
 *     case-insensitively under most locales; and SQLite puts NULLs first on
 *     ASC / last on DESC where Postgres does the reverse. `lower()` and
 *     `.nullsLast()` are what make the same request answer in the same order
 *     on both — and each is applied only where it is needed, since `lower()`
 *     on a column that cannot vary in case makes an index unusable for the
 *     sort and `.nullsLast()` on a NOT NULL column can push Postgres into a
 *     sort it would otherwise skip.
 *  3. **The tiebreaker.** Postgres gives no implicit row order on equal keys,
 *     so an unbroken tie under LIMIT/OFFSET shows a row on two pages or on
 *     none.
 *
 * On the case-folding and NULL-placement tests, note WHICH backend does the
 * catching. Dropping `lower()` fails on BOTH under the CI image: a default
 * `postgres:*-alpine` sorts by byte order despite `datcollate = en_US.utf8`,
 * because musl has no locale data and libc collation falls back to byte
 * comparison — so CI's Postgres agrees with SQLite here, and a glibc image or
 * an ICU collation is where the two would diverge. (That cuts the other way
 * too: CI cannot see a MISSING `lower()` as a dialect disagreement, only as a
 * wrong order, which is why these tests assert the case-insensitive order
 * outright rather than comparing the two backends to each other.) For NULLs
 * the split is real on any image: SQLite catches a dropped `.nullsLast()` on
 * ASC and Postgres on DESC, since each dialect's default already agrees with
 * the pinned answer in the other direction. Both directions are asserted so
 * that whichever backend is running, one of them is load-bearing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore, isAuditSortKey, AUDIT_SORT_COLUMNS } from '../../src/core/db/admin-store'

// Same harness as admin-store.test.ts: SQLite always, Postgres when
// TEST_DATABASE_URL is set.
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
  user_id?: string
  action?: string
  vertical?: string | null
  target_id?: string | null
  created_at?: number
}

describe.each(BACKENDS)('listAudit ordering [$name]', (backend) => {
  let handle: DbHandle
  let store: AdminStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await AdminStore.create(handle)
    // Boot writes a `schema.migrate` row per applied migration. Every ordering
    // assertion below is over the FULL result, so those rows would sit in the
    // middle of it — clear them and seed a known set instead.
    await store.pruneAuditLogBefore(Date.now() + 60_000)
  })

  afterEach(async () => {
    await store?.close()
  })

  /**
   * Insert rows straight through Kysely rather than `writeAudit`, whose
   * `action` is typed against the closed registry in `audit-actions.ts` — the
   * case-folding fixtures below need mixed-case values that registry cannot
   * express. `id` is autoincrement/identity, so insertion order is id order.
   */
  async function seed(rows: SeedRow[]): Promise<void> {
    let t = 1_700_000_000_000
    for (const r of rows) {
      await handle.kysely
        .insertInto('audit_log')
        .values({
          user_id: r.user_id ?? 'u',
          action: r.action ?? 'user.login',
          vertical: r.vertical ?? null,
          target_id: r.target_id ?? null,
          detail: null,
          created_at: r.created_at ?? t++,
        })
        .execute()
    }
  }

  const targets = (rows: Array<{ target_id: string | null }>) => rows.map((r) => r.target_id)

  it('orders newest first with an id tiebreaker when no sort is given', async () => {
    await seed([
      { target_id: 'oldest', created_at: 100 },
      { target_id: 'newest', created_at: 300 },
      { target_id: 'middle', created_at: 200 },
    ])
    expect(targets(await store.listAudit(50, 0))).toEqual(['newest', 'middle', 'oldest'])
  })

  it('falls back to the default order for a key outside the allow-list', async () => {
    await seed([
      { target_id: 'oldest', created_at: 100 },
      { target_id: 'newest', created_at: 300 },
      { target_id: 'middle', created_at: 200 },
    ])
    const rows = await store.listAudit(50, 0, undefined, { key: 'detail', dir: 'asc' })
    expect(targets(rows)).toEqual(['newest', 'middle', 'oldest'])
  })

  // The two values that make Kysely THROW rather than merely mis-sort. Both
  // are reachable by hand-editing a URL, and both were 500s before the
  // allow-list existed.
  it.each([
    ['the deprecated "col dir" string form', 'created_at desc'],
    ['a prototype key', '__proto__'],
    ['a prototype method', 'constructor'],
    ['a physical column name that is not a UI key', 'user_id'],
  ])('does not throw on %s', async (_label, key) => {
    await seed([{ target_id: 'only' }])
    const rows = await store.listAudit(50, 0, undefined, { key, dir: 'asc' })
    expect(targets(rows)).toEqual(['only'])
    expect(isAuditSortKey(key)).toBe(false)
  })

  /**
   * `listAudit`'s own defence-in-depth clamp, exercised through the public
   * method rather than through `/api/audit`.
   *
   * The route parses with `parseInt`, which truncates, so no fraction reaches
   * this clamp THROUGH THE ROUTE — which is precisely the argument that was
   * overturned in Part A, where the clamp had to close the input CLASS rather
   * than the input recon happened to type. `AdminStore` is public and this
   * file already calls it directly, so the caller the clamp's own comment
   * anticipates ("a future admin-api endpoint, a test") is this one.
   *
   * `Number.isFinite(2.5)` is `true`, so a finite-only guard passes the
   * fraction through to `.limit(2.5)`, where SQLite's `OP_MustBeInt` throws
   * `SqliteError: datatype mismatch`. `Number.isInteger` collapses it to the
   * method's own default instead — which is why the assertion is on the ROW
   * COUNT, not merely on "did not throw": a guard that let 2.5 through on a
   * dialect that tolerated it would return two rows, not three.
   */
  it('collapses a fractional limit or offset to its own defaults rather than throwing', async () => {
    await seed([{ target_id: 'a' }, { target_id: 'b' }, { target_id: 'c' }])
    expect(await store.listAudit(2.5, 0)).toHaveLength(3)
    expect(await store.listAudit(100, 1.5)).toHaveLength(3)
    // And a genuine integer limit is still honoured exactly, so the three
    // above are not passing because the limit is ignored altogether.
    expect(await store.listAudit(2, 0)).toHaveLength(2)
  })

  it('exposes exactly the five UI sort keys', () => {
    expect(Object.keys(AUDIT_SORT_COLUMNS)).toEqual([
      'time',
      'user',
      'action',
      'vertical',
      'target',
    ])
    for (const key of Object.keys(AUDIT_SORT_COLUMNS)) expect(isAuditSortKey(key)).toBe(true)
  })

  it('sorts by time in the requested direction', async () => {
    await seed([
      { target_id: 'oldest', created_at: 100 },
      { target_id: 'newest', created_at: 300 },
      { target_id: 'middle', created_at: 200 },
    ])
    expect(targets(await store.listAudit(50, 0, undefined, { key: 'time', dir: 'asc' }))).toEqual([
      'oldest',
      'middle',
      'newest',
    ])
    expect(targets(await store.listAudit(50, 0, undefined, { key: 'time', dir: 'desc' }))).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })

  // The whole map, pinned literally. `AUDIT_SORT_COLUMNS` is the one place a
  // UI key becomes a physical column, and nothing else in the codebase would
  // notice a wrong entry: `DbSchema` is `Record<string, any>`, so `user` could
  // be pointed at `action` and still compile, still run, and still return a
  // plausible-looking page.
  it('maps each UI key to the physical column it claims', () => {
    expect(AUDIT_SORT_COLUMNS).toEqual({
      time: 'created_at',
      user: 'user_id',
      action: 'action',
      vertical: 'vertical',
      target: 'target_id',
    })
  })

  // The behavioural half of the same guard, and the reason the expected order
  // is written out per case rather than derived: an earlier version of this
  // test read the field to assert on OUT of `AUDIT_SORT_COLUMNS[key]`, so
  // repointing `user` at `action` moved the assertion along with the bug and
  // left every backend green. The two orders below are deliberately DIFFERENT
  // from each other and from the default, so getting the column wrong cannot
  // coincide with getting it right.
  it.each([
    { key: 'user' as const, expected: ['r-alice', 'r-bob', 'r-carol'] },
    { key: 'action' as const, expected: ['r-carol', 'r-bob', 'r-alice'] },
  ])('sorts by $key on its own column, not a neighbouring one', async ({ key, expected }) => {
    await seed([
      { user_id: 'carol', action: 'a.first', target_id: 'r-carol' },
      { user_id: 'alice', action: 'c.third', target_id: 'r-alice' },
      { user_id: 'bob', action: 'b.second', target_id: 'r-bob' },
    ])
    expect(targets(await store.listAudit(50, 0, undefined, { key, dir: 'asc' }))).toEqual(expected)
    expect(targets(await store.listAudit(50, 0, undefined, { key, dir: 'desc' }))).toEqual(
      [...expected].reverse(),
    )
  })

  // `target_id` is the ONE sort column carrying caller-supplied free text of
  // arbitrary case (a label, an external id), so it is the one that gets
  // `lower()`. These seed values order differently under SQLite's BINARY
  // collation ('Beta' < 'Zeta' < 'alpha', by byte value) than
  // case-insensitively ('alpha' < 'Beta' < 'Zeta'), which is what makes this
  // assertion fail if the `lower()` is removed.
  it('orders target case-insensitively, so both dialects answer the same way', async () => {
    await seed([{ target_id: 'Zeta-x' }, { target_id: 'alpha-y' }, { target_id: 'Beta-z' }])
    expect(targets(await store.listAudit(50, 0, undefined, { key: 'target', dir: 'asc' }))).toEqual([
      'alpha-y',
      'Beta-z',
      'Zeta-x',
    ])
    expect(
      targets(await store.listAudit(50, 0, undefined, { key: 'target', dir: 'desc' })),
    ).toEqual(['Zeta-x', 'Beta-z', 'alpha-y'])
  })

  // Both nullable sort columns pin NULLs LAST in BOTH directions — the same
  // rule table-controls.ts's in-memory sort already applies ("Absent values
  // sort last in BOTH directions — a missing date is unknown, not earliest").
  // `vertical` gets `lower()` as well as `.nullsLast()`, and the seed is
  // MIXED CASE on purpose. The nine vertical slugs are a convention, not a
  // constraint: `POST /api/internal/audit` validates the field as
  // `z.string().max(80).nullish()` and writes it straight into the column, so
  // a service can put `CRM` or `Docsign` there. Under byte collation those
  // sort before every lowercase value; under a locale-aware one they do not.
  //
  // The row labels are deliberately NOT in the same order as the verticals
  // they sit on, so pointing this key at `target_id` cannot coincidentally
  // produce the expected answer.
  it('orders vertical case-insensitively, with no-vertical rows LAST in both directions', async () => {
    await seed([
      { vertical: 'CRM', target_id: 'r1' },
      { vertical: null, target_id: 'r2' },
      { vertical: 'accounting', target_id: 'r3' },
      { vertical: 'Docsign', target_id: 'r4' },
    ])
    expect(
      targets(await store.listAudit(50, 0, undefined, { key: 'vertical', dir: 'asc' })),
    ).toEqual(['r3', 'r1', 'r4', 'r2'])
    expect(
      targets(await store.listAudit(50, 0, undefined, { key: 'vertical', dir: 'desc' })),
    ).toEqual(['r4', 'r1', 'r3', 'r2'])
  })

  // The `user_id` labels are deliberately NOT in the same order as the
  // targets they sit on (`u1` carries the LAST target ascending), so ordering
  // on the wrong column cannot produce the expected answer by accident.
  it('sorts rows with no target LAST, ascending and descending', async () => {
    await seed([
      { target_id: 'bbb', user_id: 'u1' },
      { target_id: null, user_id: 'u2' },
      { target_id: 'aaa', user_id: 'u3' },
    ])
    const asc = await store.listAudit(50, 0, undefined, { key: 'target', dir: 'asc' })
    expect(asc.map((r) => r.user_id)).toEqual(['u3', 'u1', 'u2'])
    const desc = await store.listAudit(50, 0, undefined, { key: 'target', dir: 'desc' })
    expect(desc.map((r) => r.user_id)).toEqual(['u1', 'u3', 'u2'])
  })

  // Rows that tie on the sort key fall through to the SAME default ordering
  // the table has without any sort at all — `created_at DESC, id DESC`, never
  // the requested direction. The EXACT order is asserted, not merely that the
  // pages do not overlap: with four rows and no tiebreaker at all, both
  // dialects still happen to return them in insertion order here, so a
  // "no repeats, no gaps" assertion passes against a query that has no
  // deterministic order at all and would come apart under a real workload.
  it('breaks a tie on the sort key with created_at DESC, not the sort direction', async () => {
    await seed([
      { action: 'user.login', target_id: 'oldest', created_at: 100 },
      { action: 'user.login', target_id: 'newest', created_at: 300 },
      { action: 'user.login', target_id: 'middle', created_at: 200 },
    ])
    const rows = await store.listAudit(50, 0, undefined, { key: 'action', dir: 'asc' })
    expect(targets(rows)).toEqual(['newest', 'middle', 'oldest'])
  })

  // Every row here ties on BOTH the sort key and `created_at`, so only the
  // `id` tiebreaker separates them — and `id` is monotonic, so DESC is
  // newest-inserted first. Without it the pages could overlap or skip, on
  // Postgres in particular, where equal keys have no implicit order.
  it('pages a fully tied sort deterministically, by id DESC', async () => {
    await seed([
      { action: 'user.login', target_id: 't1', created_at: 500 },
      { action: 'user.login', target_id: 't2', created_at: 500 },
      { action: 'user.login', target_id: 't3', created_at: 500 },
      { action: 'user.login', target_id: 't4', created_at: 500 },
    ])
    const sort = { key: 'action', dir: 'asc' as const }
    expect(targets(await store.listAudit(4, 0, undefined, sort))).toEqual([
      't4',
      't3',
      't2',
      't1',
    ])
    // And the pages line up with that whole: no row on two pages or on none.
    expect(targets(await store.listAudit(2, 0, undefined, sort))).toEqual(['t4', 't3'])
    expect(targets(await store.listAudit(2, 2, undefined, sort))).toEqual(['t2', 't1'])
    // Repeatable: the same request twice gives the same slice.
    expect(targets(await store.listAudit(2, 2, undefined, sort))).toEqual(['t2', 't1'])
  })

  // The vertical filter lives in `auditWhere`, so list, count and export can
  // never disagree about which rows match — a filter added to `listAudit`
  // alone would page over a narrowed set while `meta.total` counted the whole
  // log and the export downloaded it.
  it('filters vertical as a case-insensitive substring in list, count AND export', async () => {
    await seed([
      { vertical: 'accounting', target_id: 'a' },
      { vertical: 'CRM', target_id: 'b' },
      { vertical: null, target_id: 'c' },
    ])
    expect(targets(await store.listAudit(50, 0, { vertical: 'crm' }))).toEqual(['b'])
    expect(await store.countAudit({ vertical: 'crm' })).toBe(1)
    expect(targets(await store.iterateAudit({ vertical: 'crm' }))).toEqual(['b'])
    // A substring, not an exact match.
    expect(await store.countAudit({ vertical: 'count' })).toBe(1)
    // A row with no vertical matches no needle — the em dash the cell renders
    // is not searchable text.
    expect(await store.countAudit({ vertical: '' })).toBe(3)
    expect(await store.countAudit({ vertical: 'nope' })).toBe(0)
  })
})
