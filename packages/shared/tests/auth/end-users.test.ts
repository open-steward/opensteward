import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { EndUserStore, DuplicateEmailError, END_USER_SORT_COLUMNS } from '../../src/auth/end-users'

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

const SECRET = 'test-secret-not-for-production-use-only'

describe.each(BACKENDS)('EndUserStore [$name]', (backend) => {
  let handle: DbHandle
  let store: EndUserStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await EndUserStore.create(handle, SECRET)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('create() inserts a row and lowercases the email', async () => {
    const row = await store.create({ tenantId: 't1', email: 'Jane@Example.com' })
    expect(row.id).toBeDefined()
    expect(row.email).toBe('jane@example.com')
    expect(row.tenantId).toBe('t1')
  })

  it('create() throws DuplicateEmailError for the same (tenantId, email)', async () => {
    await store.create({ tenantId: 't1', email: 'jane@example.com' })
    await expect(
      store.create({ tenantId: 't1', email: 'JANE@EXAMPLE.COM' }),
    ).rejects.toBeInstanceOf(DuplicateEmailError)
    // Different tenant, same email: not a collision.
    await expect(store.create({ tenantId: 't2', email: 'jane@example.com' })).resolves.toBeDefined()
  })

  it('upsertByEmail resolves the existing row and patches fields on a hit', async () => {
    const created = await store.create({ tenantId: 't1', email: 'jane@example.com' })
    const upserted = await store.upsertByEmail({
      tenantId: 't1',
      email: 'jane@example.com',
      displayName: 'Jane Doe',
    })
    expect(upserted.id).toBe(created.id)
    expect(upserted.displayName).toBe('Jane Doe')
  })

  it('findByEmail is case-insensitive and tenant-scoped', async () => {
    await store.create({ tenantId: 't1', email: 'jane@example.com' })
    expect(await store.findByEmail('t1', 'JANE@EXAMPLE.COM')).not.toBeNull()
    expect(await store.findByEmail('t2', 'jane@example.com')).toBeNull()
  })

  it('getById round-trips PII only when includePii is requested', async () => {
    const created = await store.create({
      tenantId: 't1',
      email: 'jane@example.com',
      pii: { firstName: 'Jane', personalIdNumber: '123-45-6789' },
    })
    const withoutPii = await store.getById(created.id)
    expect(withoutPii?.pii).toBeNull()
    const withPii = await store.getById(created.id, { includePii: true })
    expect(withPii?.pii?.firstName).toBe('Jane')
    expect(withPii?.pii?.personalIdNumber).toBe('123-45-6789')
  })

  it('update() patches display name / external reference and leaves PII untouched when omitted', async () => {
    const created = await store.create({
      tenantId: 't1',
      email: 'jane@example.com',
      pii: { firstName: 'Jane' },
    })
    const updated = await store.update(created.id, { displayName: 'Jane D.' })
    expect(updated?.displayName).toBe('Jane D.')
    const row = await store.getById(created.id, { includePii: true })
    expect(row?.pii?.firstName).toBe('Jane')
  })

  it('deleteById removes the row', async () => {
    const created = await store.create({ tenantId: 't1', email: 'jane@example.com' })
    expect(await store.deleteById(created.id)).toBe(true)
    expect(await store.getById(created.id)).toBeNull()
    expect(await store.deleteById(created.id)).toBe(false)
  })

  describe('list()', () => {
    it('filters by tenantId and matches q against email/display name/external reference', async () => {
      await store.create({ tenantId: 't1', email: 'jane@example.com', displayName: 'Jane Doe' })
      await store.create({
        tenantId: 't1',
        email: 'bob@example.com',
        externalReference: 'ext-jane-1',
      })
      await store.create({ tenantId: 't2', email: 'jane@example.com' })

      const forTenant = await store.list({ tenantId: 't1' })
      expect(forTenant).toHaveLength(2)

      const byEmail = await store.list({ tenantId: 't1', q: 'jane@example' })
      expect(byEmail.map((r) => r.email)).toEqual(['jane@example.com'])

      const byExternalRef = await store.list({ tenantId: 't1', q: 'ext-jane' })
      expect(byExternalRef.map((r) => r.email)).toEqual(['bob@example.com'])
    })

    it('defaults to 50 rows and caps at 200 regardless of how many exist', async () => {
      for (let i = 0; i < 205; i++) {
        await store.create({ tenantId: 't1', email: `user${i}@example.com` })
      }
      expect(await store.list({ tenantId: 't1' })).toHaveLength(50)
      expect(await store.list({ tenantId: 't1', limit: 500 })).toHaveLength(200)
      expect(await store.list({ tenantId: 't1', limit: 10 })).toHaveLength(10)
    })

    // A1: `GET /v1/customers?limit=abc` passes `limit: Number('abc')` — i.e.
    // `NaN` — straight through, with no Zod querystring schema to reject it
    // first. Before the fix, `Math.min(NaN, 200)` was itself `NaN`, and
    // Kysely's `.limit(NaN)` threw `SqliteError: datatype mismatch` (a 500 on
    // a public, scope-gated endpoint). The same shape of bug existed for
    // `?offset=abc` via `Math.max(NaN, 0)`.
    it('a non-numeric limit or offset does not 500 and falls back to the default (A1)', async () => {
      await store.create({ tenantId: 't1', email: 'jane@example.com' })
      const rows = await store.list({ tenantId: 't1', limit: Number('abc'), offset: Number('abc') })
      expect(rows).toHaveLength(1)
    })

    // Same class of bug as A1, not the NaN instance but the fractional one:
    // `customers-router.ts` parses with `Number(...)`, not `parseInt`, so
    // `?limit=50.5`/`?offset=0.5` reach here un-truncated. `Number.isFinite`
    // alone would have let a fraction through to `.limit()`/`.offset()` —
    // SQLite's `OP_MustBeInt` rejects a non-integral value with the
    // identical `SqliteError: datatype mismatch` A1 was. `Number.isInteger`
    // is what actually excludes it.
    it('a fractional limit or offset does not 500 and falls back to the default', async () => {
      await store.create({ tenantId: 't1', email: 'jane@example.com' })
      const rows = await store.list({ tenantId: 't1', limit: 50.5, offset: 0.5 })
      expect(rows).toHaveLength(1)
    })

    // Seeded past the 50-row default so both halves actually falsify
    // pre-fix: `limit: 0` compiled to `LIMIT 0` (0 rows, not "default"), and
    // `limit: -1` compiled to `LIMIT -1`, which SQLite reads as UNLIMITED (55
    // rows, not "default"). Fewer than 51 seeded rows would make the `-1`
    // half pass either way, since an unbounded result and a 50-row default
    // both look identical to a set that never had more than 50 to begin with.
    it('a zero or negative limit falls back to the default rather than widening the result', async () => {
      for (let i = 0; i < 55; i++) {
        await store.create({ tenantId: 't1', email: `user${i}@example.com` })
      }
      expect(await store.list({ tenantId: 't1', limit: 0 })).toHaveLength(50)
      expect(await store.list({ tenantId: 't1', limit: -1 })).toHaveLength(50)
    })

    // The default order, `created_at DESC`, ties on bulk seeding or a
    // scripted import — `created_at` is `Date.now()` epoch-ms, and two
    // creates can land in the same millisecond even without forcing it, but
    // forcing it makes the assertion fail deterministically pre-fix rather
    // than only on unlucky timing.
    it('breaks a created_at tie by id DESC, deterministically (b)', async () => {
      const first = await store.create({ tenantId: 't1', email: 'first@example.com' })
      const second = await store.create({ tenantId: 't1', email: 'second@example.com' })
      // Rewrite both rows' PRIMARY KEY ids to opposite ends of the
      // lexicographic range and force an exact `created_at` tie. `first`'s
      // physical insertion order (its SQLite rowid, unaffected by this
      // UPDATE since only non-rowid columns change) is OPPOSITE its `id
      // DESC` position: `first` was created before `second`, but
      // `'zzz-tiebreak' > 'aaa-tiebreak'` puts `second` first under `id
      // DESC`. A comparator that dropped the `id` tiebreak and fell back to
      // whatever incidental order the tied rows come back in would return
      // `first` ahead of `second` here — the reverse of this assertion.
      await handle.kysely
        .updateTable('end_users')
        .set({ id: 'aaa-tiebreak', created_at: 1_000_000 })
        .where('id', '=', first.id)
        .execute()
      await handle.kysely
        .updateTable('end_users')
        .set({ id: 'zzz-tiebreak', created_at: 1_000_000 })
        .where('id', '=', second.id)
        .execute()

      const rows = await store.list({ tenantId: 't1' })
      expect(rows.map((r) => r.id)).toEqual(['zzz-tiebreak', 'aaa-tiebreak'])
    })

    describe('sort (part of b: a tiebreak also applies to a chosen sort column)', () => {
      it('sorts by email ascending and descending', async () => {
        await store.create({ tenantId: 't1', email: 'zeta@example.com' })
        await store.create({ tenantId: 't1', email: 'alpha@example.com' })
        await store.create({ tenantId: 't1', email: 'mike@example.com' })
        const asc = await store.list({ tenantId: 't1', sort: 'email', dir: 'asc' })
        expect(asc.map((r) => r.email)).toEqual([
          'alpha@example.com',
          'mike@example.com',
          'zeta@example.com',
        ])
        const desc = await store.list({ tenantId: 't1', sort: 'email', dir: 'desc' })
        expect(desc.map((r) => r.email)).toEqual([
          'zeta@example.com',
          'mike@example.com',
          'alpha@example.com',
        ])
      })

      // Pins the `lower()` fold-in itself, not just its absence-of-crash.
      // `email` above can't exercise this — the store lowercases it on
      // write (`create()`), so its own DB values never carry mixed case
      // regardless of what a caller typed. `display_name` carries whatever
      // case the operator entered. SQLite's BINARY collation sorts
      // uppercase before ALL lowercase (`'Beta' < 'Zeta' < 'alpha'`, byte
      // value), which disagrees with the case-insensitive order
      // (`alpha < Beta < Zeta`) `lower()` on both sides produces —
      // Postgres's default collation already agrees with the
      // case-insensitive order, which is exactly why a regression here is
      // invisible without a mixed-case fixture on SQLite specifically.
      it('sorts displayName case-insensitively, not by SQLite BINARY collation', async () => {
        const zeta = await store.create({
          tenantId: 't1',
          email: 'zeta-case@example.com',
          displayName: 'Zeta Corp',
        })
        const alpha = await store.create({
          tenantId: 't1',
          email: 'alpha-case@example.com',
          displayName: 'alpha corp',
        })
        const beta = await store.create({
          tenantId: 't1',
          email: 'beta-case@example.com',
          displayName: 'Beta Corp',
        })
        const rows = await store.list({ tenantId: 't1', sort: 'displayName', dir: 'asc' })
        expect(rows.map((r) => r.id)).toEqual([alpha.id, beta.id, zeta.id])
      })

      /**
       * The tie the block's own NAME claims to cover. None of its other cases
       * ever creates one: every fixture above has distinct values in the sort
       * column, so deleting the tiebreaker from the SORTED branch left all
       * 1776 shared tests green. The sibling at the top of this describe
       * (`breaks a created_at tie by id DESC`) does bite, but it guards the
       * DEFAULT branch — a different code path — and its `(b)` label was
       * reasonably read as covering both.
       *
       * `tenantId` is the sort column and both rows share a tenant, so the
       * sort key ties outright and only the tiebreaker separates them. The
       * expected order is `created_at DESC, id DESC` — the default order —
       * NOT the requested direction, which is the convention this store was
       * moved onto (it used to break the tie with `id` in the SORT direction).
       * `created_at` is what decides here, and `newer` is deliberately the
       * row whose `id` sorts FIRST ascending, so neither `id ASC` nor `id
       * DESC` can produce this answer by coincidence.
       */
      it('breaks a tie ON THE SORT KEY with the default order, not the sort direction', async () => {
        const older = await store.create({ tenantId: 't1', email: 'older@example.com' })
        const newer = await store.create({ tenantId: 't1', email: 'newer@example.com' })
        await handle.kysely
          .updateTable('end_users')
          .set({ id: 'zzz-older', created_at: 1_000_000 })
          .where('id', '=', older.id)
          .execute()
        await handle.kysely
          .updateTable('end_users')
          .set({ id: 'aaa-newer', created_at: 2_000_000 })
          .where('id', '=', newer.id)
          .execute()

        // Both directions give the SAME answer: the tie falls through to
        // `created_at DESC`, which does not follow `dir`. Under the old
        // convention (`orderBy('id', dir)`) ascending would have answered
        // ['aaa-newer', 'zzz-older'] and descending the reverse — so this
        // asserts the two are equal AND what they equal.
        for (const dir of ['asc', 'desc'] as const) {
          const rows = await store.list({ tenantId: 't1', sort: 'tenantId', dir })
          expect(rows.map((r) => r.id)).toEqual(['aaa-newer', 'zzz-older'])
        }
      })

      /**
       * `sort: 'created'` had NO test at all, and `/customers?sort=created` is
       * a live reachable path.
       *
       * It also gets its own branch in the store rather than falling through
       * to the shared tiebreaker, which would emit
       * `ORDER BY created_at <dir>, created_at DESC, id DESC`. That is valid
       * and behaviour-correct on both dialects — the second copy decides
       * nothing — but it reads as though it overrode the operator's choice,
       * which is why `AdminStore.listAudit` and `SyncStore.list` each carve
       * the same case out. This asserts the BEHAVIOUR that carve-out has to
       * preserve: ascending really is oldest-first, i.e. the opposite of the
       * default order, so a `created_at DESC` that actually won would fail
       * here.
       */
      it('sorts by created in the requested direction, not the default one', async () => {
        const first = await store.create({ tenantId: 't1', email: 'first@example.com' })
        const second = await store.create({ tenantId: 't1', email: 'second@example.com' })
        const third = await store.create({ tenantId: 't1', email: 'third@example.com' })
        // Explicit timestamps: `create()` stamps `Date.now()`, so three rows
        // in the same millisecond tie and the `id` tiebreak is a `randomUUID`.
        for (const [row, at] of [
          [first, 1_000_000],
          [second, 2_000_000],
          [third, 3_000_000],
        ] as const) {
          await handle.kysely
            .updateTable('end_users')
            .set({ created_at: at })
            .where('id', '=', row.id)
            .execute()
        }
        const asc = await store.list({ tenantId: 't1', sort: 'created', dir: 'asc' })
        expect(asc.map((r) => r.email)).toEqual([
          'first@example.com',
          'second@example.com',
          'third@example.com',
        ])
        const desc = await store.list({ tenantId: 't1', sort: 'created', dir: 'desc' })
        expect(desc.map((r) => r.email)).toEqual([
          'third@example.com',
          'second@example.com',
          'first@example.com',
        ])
      })

      /**
       * And a tie ON `created_at` itself still pages deterministically, which
       * is what the carve-out's own `id DESC` is for — the shared tiebreaker
       * is not appended on this branch, so if the carve-out dropped its `id`
       * term the tie would have nothing left to break it.
       *
       * The ids are assigned OPPOSITE to insertion order so the answer cannot
       * coincide with whatever incidental order tied rows come back in.
       */
      it('breaks a created_at tie by id DESC on the created sort too', async () => {
        for (const [email, id] of [
          ['a@example.com', 'aaa-created'],
          ['m@example.com', 'mmm-created'],
          ['z@example.com', 'zzz-created'],
        ]) {
          const row = await store.create({ tenantId: 't1', email })
          await handle.kysely
            .updateTable('end_users')
            .set({ id, created_at: 5_000_000 })
            .where('id', '=', row.id)
            .execute()
        }
        for (const dir of ['asc', 'desc'] as const) {
          const rows = await store.list({ tenantId: 't1', sort: 'created', dir })
          expect(rows.map((r) => r.id)).toEqual(['zzz-created', 'mmm-created', 'aaa-created'])
        }
      })

      it('falls back to the default order for an unrecognised sort key, not a 500', async () => {
        await store.create({ tenantId: 't1', email: 'a@example.com' })
        await expect(
          store.list({ tenantId: 't1', sort: 'not_a_real_column' }),
        ).resolves.toHaveLength(1)
      })

      // `END_USER_SORT_COLUMNS` is a plain object literal, so
      // `sortParam in END_USER_SORT_COLUMNS`
      // would also match `Object.prototype` keys (`constructor`, `valueOf`,
      // …) — `constructor` resolves to the `Object` constructor rather than
      // a column name, which is not a valid Kysely `orderBy` argument and
      // throws when used as one. `not_a_real_column` above can't catch this:
      // `in` correctly rejects a key that isn't on the prototype chain
      // either; only a real prototype key exercises the bug.
      // `END_USER_SORT_KEYS.has(...)` (a `Set` of own keys) excludes it.
      it('falls back to the default order for a sort key inherited from Object.prototype, not a 500', async () => {
        await store.create({ tenantId: 't1', email: 'a@example.com' })
        await expect(store.list({ tenantId: 't1', sort: 'constructor' })).resolves.toHaveLength(1)
      })

      /**
       * Every key in the map, pinned — the two cases above cover `email` and
       * `created`, and `displayName`'s case-fold case can only see SOME wrong
       * answers: its fixture's emails (`alpha-case@`, `beta-case@`,
       * `zeta-case@`) are ordered identically to its display names, so
       * repointing `displayName` at `email` produced the expected answer
       * anyway. `externalReference` and `tenantId` had no behavioural test at
       * all — each could be pointed at a neighbouring column with all 1776
       * shared tests green.
       *
       * ONE fixture serves all five, and every column's ascending order is a
       * DIFFERENT permutation of the four rows — none of them equal to the
       * default order (`created_at DESC, id DESC` = A, C, B... written out per
       * case below) — so a test's expected value can never be what the broken
       * code returns, whether the break is a map entry pointed at a
       * neighbouring column or the sort being dropped entirely.
       *
       *   default        D A C B      email asc        B D C A
       *   displayName    C A D B      externalRef asc  D C A B
       *   tenantId asc   A D B C      created asc      B C A D
       *
       * The three nullable/mixed-case columns are seeded mixed-case as well,
       * so each also fails if its `lower()` is dropped: under SQLite's BINARY
       * collation `display_name` answers A B C D, `external_reference` C B D A
       * and `tenant_id` D C A B — none of which is the expected order.
       *
       * `updated_at` is deliberately NOT a copy of `created_at` (it orders
       * A, D, C, B): it is the neighbouring column `created` is most likely to
       * be mispointed at, and a fixture that stamped both the same would make
       * that mutation invisible to the behavioural half of this guard.
       *
       * `end_users` carries no index that can produce any of these orders on
       * its own: its two indexes are `(tenant_id, lower(email))` and
       * `(tenant_id, external_reference)`, both tenant-first, and the four
       * rows sit in four different tenants.
       */
      const SORT_FIXTURE = [
        {
          id: 'eu-a',
          tenant_id: 't-alpha',
          email: 'delta@example.com',
          display_name: 'Bison Ltd',
          external_reference: 'ext-charlie',
          created_at: 300,
          updated_at: 100,
        },
        {
          id: 'eu-b',
          tenant_id: 't-charlie',
          email: 'alpha@example.com',
          display_name: 'Dingo Ltd',
          external_reference: 'ext-Delta',
          created_at: 100,
          updated_at: 400,
        },
        {
          id: 'eu-c',
          tenant_id: 't-Delta',
          email: 'charlie@example.com',
          display_name: 'aardvark ltd',
          external_reference: 'ext-Bravo',
          created_at: 200,
          updated_at: 300,
        },
        {
          id: 'eu-d',
          tenant_id: 't-Bravo',
          email: 'bravo@example.com',
          display_name: 'cheetah ltd',
          external_reference: 'ext-alpha',
          created_at: 400,
          updated_at: 200,
        },
      ]

      /**
       * Inserted straight through Kysely rather than `create()`, which mints a
       * `randomUUID` id and stamps `created_at` with `Date.now()` — both have
       * to be known values for an order to be assertable at all.
       */
      async function seedSortFixture(): Promise<void> {
        for (const row of SORT_FIXTURE) {
          await handle.kysely
            .insertInto('end_users')
            .values({ ...row, pii_data: null })
            .execute()
        }
      }

      it('offers exactly the five UI sort keys, each on the column it claims', () => {
        expect(END_USER_SORT_COLUMNS).toEqual({
          email: 'email',
          displayName: 'display_name',
          externalReference: 'external_reference',
          tenantId: 'tenant_id',
          created: 'created_at',
        })
      })

      /**
       * The behavioural half of the same guard. The expected order is written
       * out per case rather than derived from `END_USER_SORT_COLUMNS[key]` —
       * deriving it would move the assertion along with the bug and leave
       * every backend green, which is how /audit's first version of this test
       * failed to bite.
       */
      it.each([
        { key: 'email', expected: ['eu-b', 'eu-d', 'eu-c', 'eu-a'] },
        { key: 'displayName', expected: ['eu-c', 'eu-a', 'eu-d', 'eu-b'] },
        { key: 'externalReference', expected: ['eu-d', 'eu-c', 'eu-a', 'eu-b'] },
        { key: 'tenantId', expected: ['eu-a', 'eu-d', 'eu-b', 'eu-c'] },
        { key: 'created', expected: ['eu-b', 'eu-c', 'eu-a', 'eu-d'] },
      ])('sorts by $key on its own column, not a neighbouring one', async ({ key, expected }) => {
        await seedSortFixture()
        expect((await store.list({ sort: key, dir: 'asc' })).map((r) => r.id)).toEqual(expected)
        expect((await store.list({ sort: key, dir: 'desc' })).map((r) => r.id)).toEqual(
          [...expected].reverse(),
        )
      })

      // The order every one of the six cases above has to differ from, so
      // none of them can be satisfied by a dropped sort.
      it('answers the same fixture in created_at DESC, id DESC order with no sort', async () => {
        await seedSortFixture()
        expect((await store.list({})).map((r) => r.id)).toEqual(['eu-d', 'eu-a', 'eu-c', 'eu-b'])
      })
    })

    describe('per-column filters (c)', () => {
      it('email matches a case-insensitive substring', async () => {
        await store.create({ tenantId: 't1', email: 'jane@example.com' })
        await store.create({ tenantId: 't1', email: 'bob@example.com' })
        const rows = await store.list({ tenantId: 't1', email: 'JANE' })
        expect(rows.map((r) => r.email)).toEqual(['jane@example.com'])
      })

      it('displayName matches a case-insensitive substring', async () => {
        await store.create({ tenantId: 't1', email: 'a@example.com', displayName: 'Jane Doe' })
        await store.create({ tenantId: 't1', email: 'b@example.com', displayName: 'Bob Smith' })
        const rows = await store.list({ tenantId: 't1', displayName: 'doe' })
        expect(rows.map((r) => r.email)).toEqual(['a@example.com'])
      })

      it('externalReference matches a case-insensitive substring', async () => {
        await store.create({
          tenantId: 't1',
          email: 'a@example.com',
          externalReference: 'CRM-100',
        })
        await store.create({
          tenantId: 't1',
          email: 'b@example.com',
          externalReference: 'CRM-200',
        })
        const rows = await store.list({ tenantId: 't1', externalReference: 'crm-1' })
        expect(rows.map((r) => r.email)).toEqual(['a@example.com'])
      })

      // Proves `email` filters ONLY the email column rather than being
      // implemented as an alias for `q` (which also matches
      // externalReference) — folding a column filter onto `q` is the
      // mistake this feature has already made once elsewhere (see the
      // `q`-is-not-a-column-filter comment on `endUserWhere`) and had to
      // revert; this pins the Email column specifically against the same
      // regression.
      it('a per-column filter does not also match what q would on another field', async () => {
        await store.create({
          tenantId: 't1',
          email: 'nomatch@example.com',
          externalReference: 'special-token',
        })
        const rows = await store.list({ tenantId: 't1', email: 'special-token' })
        expect(rows).toHaveLength(0)
      })

      it('combines a per-column filter with q (AND), not either alone', async () => {
        await store.create({
          tenantId: 't1',
          email: 'alpha@example.com',
          displayName: 'shared-tag',
        })
        await store.create({
          tenantId: 't1',
          email: 'bravo@example.com',
          displayName: 'shared-tag',
        })
        // q alone: both rows share the displayName text.
        expect(await store.list({ tenantId: 't1', q: 'shared-tag' })).toHaveLength(2)
        // email filter alone: only alpha.
        expect(await store.list({ tenantId: 't1', email: 'alpha' })).toHaveLength(1)
        // Both together must be the true intersection, not either filter
        // silently winning outright.
        const combined = await store.list({ tenantId: 't1', q: 'shared-tag', email: 'alpha' })
        expect(combined.map((r) => r.email)).toEqual(['alpha@example.com'])
      })
    })
  })

  describe('countEndUsers() (a)', () => {
    // The live bug this fixes: admin-api's `/api/end-users?page=` used to
    // compute `meta.total` by calling `list()` with NO limit and reading
    // `all.length` — which silently collapsed to `list()`'s own 50-row
    // default (there was no way to ask for "all" rows), so `meta.total` was
    // capped at 50 no matter how many customers actually existed, and the
    // 51st was unreachable from the admin UI. 55 seeded rows, with a real
    // COUNT query, must report 55 — not 50.
    it('is not capped at list()’s own default/ceiling — proves the 51st (and 55th) row is countable', async () => {
      for (let i = 0; i < 55; i++) {
        await store.create({ tenantId: 't1', email: `user${i}@example.com` })
      }
      expect(await store.countEndUsers({ tenantId: 't1' })).toBe(55)
      const page1 = await store.list({ tenantId: 't1', limit: 50, offset: 0 })
      const page2 = await store.list({ tenantId: 't1', limit: 50, offset: 50 })
      expect(page1).toHaveLength(50)
      // The row `list()`'s old 50-row default made unreachable: page 2 has
      // to exist and carry the remaining 5, or "55 total" is a number with
      // nowhere for the extra rows to actually appear.
      expect(page2).toHaveLength(5)
    })

    // Guards the reason `endUserWhere` was factored out in the first place:
    // if a filter were ever added to `list()` without also adding it here,
    // `meta.total` would silently disagree with the rows `list()` actually
    // returns for the same filter.
    it('reflects the exact same filter as list(), so meta.total cannot drift from the rendered rows', async () => {
      await store.create({ tenantId: 't1', email: 'jane@example.com' })
      await store.create({ tenantId: 't1', email: 'bob@example.com' })
      expect(await store.countEndUsers({ tenantId: 't1', email: 'jane' })).toBe(1)
      expect((await store.list({ tenantId: 't1', email: 'jane' })).map((r) => r.email)).toEqual([
        'jane@example.com',
      ])
    })
  })
})
