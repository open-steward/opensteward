/**
 * `sort`, `dir` and per-column filters (`f_label`, `f_id`, `f_vertical`,
 * `f_status`, `f_platform`, `f_tenant`) on `GET /api/connections`.
 *
 * The admin `/connections` page needs server-side sorting and per-column
 * filtering — this is the wire contract it drives. Two invariants matter
 * most, because getting either wrong looks fine in a quick manual check but
 * corrupts a real page:
 *
 * - Filtering and sorting must both apply BEFORE the page slice, or
 *   `meta.total` and page 2+ reflect the wrong set.
 * - Text columns (label/id/platform) are case-insensitive substring; enum
 *   columns (vertical/status/tenant) are exact — a substring match on an
 *   enum silently widens the result the moment one value prefixes another.
 *
 * Each app instance below gets its own small, purpose-built fixture rather
 * than one shared table, so a test proving an over-match (e.g. the
 * `f_status` exact-match canary) can't leak an invalid enum value into a
 * *different* test's response and produce a misleading failure there.
 */
import { describe, it, expect, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import {
  createConnectionsRoutes,
  CONNECTION_SORT_ACCESSORS,
} from '../../src/core/routes/connections'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { Aggregator } from '../../src/core/proxy/aggregator'
import type { AdminStore } from '../../src/core/db/admin-store'

interface Row {
  id: string
  vertical: string
  platform: string
  label: string | null
  status: string
  tenantId: string | null
  createdAt: string
  updatedAt: string
}

/** Complete rows: the route serializes through the `Connection` Zod schema,
 *  which requires createdAt/updatedAt — a partial fixture 500s on the way
 *  out (this is what Plan 1's `connections-list.test.ts` regression-tests). */
function conn(overrides: Partial<Row> & { id: string }): Row {
  return {
    vertical: 'accounting',
    platform: 'fortnox',
    label: 'Untitled',
    status: 'valid',
    tenantId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()))
  apps.length = 0
})

async function makeApp(connections: Row[]): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false })
  await registerOpenApiBridge(instance)
  await instance.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  instance.decorate('authenticate', requireAuth)
  instance.decorate('operatorOnly', requireRole('operator'))
  instance.decorate('adminOnly', requireRole('admin'))
  const aggregator = { allConnections: async () => connections } as unknown as Aggregator
  await instance.register(createConnectionsRoutes(aggregator, {} as AdminStore))
  await instance.ready()
  apps.push(instance)
  return instance
}

async function list(instance: FastifyInstance, query: string) {
  const token = instance.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
  const res = await instance.inject({
    method: 'GET',
    url: `/api/connections${query}`,
    headers: { authorization: `Bearer ${token}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

function ids(data: unknown): string[] {
  return (data as { id: string }[]).map((c) => c.id)
}

// ── Main fixture: sorting, text/legacy filters, search combos, repeated key ─

const MAIN: Row[] = [
  conn({
    id: 'c-3000',
    label: 'Charlie Co',
    platform: 'fortnox',
    vertical: 'accounting',
    status: 'valid',
    tenantId: 'acme',
    createdAt: '2026-01-10T09:00:00.000Z',
    updatedAt: '2026-02-05T10:00:00.000Z',
  }),
  conn({
    id: 'c-1000',
    label: 'Alpha Inc',
    platform: 'stripe',
    vertical: 'payments',
    status: 'expiring_soon',
    tenantId: 'acme-west',
    createdAt: '2026-01-11T09:00:00.000Z',
    updatedAt: '2026-02-04T10:00:00.000Z',
  }),
  conn({
    id: 'c-2000',
    label: 'Bravo LLC',
    platform: 'shopify',
    vertical: 'ecommerce',
    status: 'expired',
    tenantId: 'acme',
    createdAt: '2026-01-12T09:00:00.000Z',
    updatedAt: '2026-02-03T10:00:00.000Z',
  }),
  conn({
    id: 'c-4000',
    label: null,
    platform: 'nutshell',
    vertical: 'crm',
    status: 'platform_error',
    tenantId: null,
    createdAt: '2026-01-13T09:00:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
  }),
]
// Natural (upstream, "updated_at DESC") order: c-3000, c-1000, c-2000, c-4000
// — this deliberately matches neither the ascending nor the descending sort
// order below, so a test that just echoed the fixture's own order back could
// not pass by accident.

describe('GET /api/connections?sort=&dir=', () => {
  it('sorts by label ascending', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?sort=label&dir=asc')
    expect(statusCode).toBe(200)
    // Alpha, Bravo, Charlie, then the unlabelled row last.
    expect(ids(body.data)).toEqual(['c-1000', 'c-2000', 'c-3000', 'c-4000'])
  })

  it('sorts by label descending — asserted explicitly because the fixture is not naturally sorted', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?sort=label&dir=desc')
    expect(statusCode).toBe(200)
    // Charlie, Bravo, Alpha, then the unlabelled row STILL last (never first).
    // This differs from both the fixture's natural order (c-3000, c-1000,
    // c-2000, c-4000) and the ascending order above, so it cannot pass by
    // reading the wrong direction or by ignoring `dir` altogether.
    expect(ids(body.data)).toEqual(['c-3000', 'c-2000', 'c-1000', 'c-4000'])
  })

  it('returns 200 in default order for an unknown sort key, not a 400', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?sort=not_a_real_column')
    // If `sort` were a Zod enum instead of a plain string, this would 400 —
    // exactly the regression this test guards against.
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000', 'c-1000', 'c-2000', 'c-4000'])
  })

  it('returns 200 in default order for a sort key inherited from Object.prototype, not a 500', async () => {
    const app = await makeApp(MAIN)
    // `CONNECTION_SORT_ACCESSORS` is a plain object literal, so a membership
    // check written as `sortParam in CONNECTION_SORT_ACCESSORS` (rather than
    // `CONNECTION_SORT_KEYS.has(sortParam)`)
    // also matches `Object.prototype` keys. `constructor` resolves to the
    // `Object` constructor rather than one of the getters in the map, and
    // calling it as one throws — `not_a_real_column` above can't catch this,
    // because `in` correctly rejects a key that isn't on the prototype chain
    // either; only a real prototype key exercises the bug.
    const { statusCode, body } = await list(app, '?sort=constructor')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000', 'c-1000', 'c-2000', 'c-4000'])
  })

  /**
   * Every key in the map, pinned. Only `label` had a behavioural test before
   * this: pointing `id`, `vertical`, `platform`, `status`, `tenant` or
   * `created` at a neighbouring field left all 629 admin-api tests green.
   *
   * ONE fixture serves all seven, and every column's ascending order is a
   * DIFFERENT permutation of the four rows — none of them the upstream order
   * MAIN_SORT is returned in — so no expected value here is what a broken path
   * answers, whether the break is an accessor reading the wrong field or the
   * sort being skipped entirely:
   *
   *   upstream     A B C D      id asc        B D C A
   *   label asc    C A D B      vertical asc  D C A B
   *   platform asc A D B C      status asc    B C A D
   *   tenant asc   C D B A      created asc   D A C B
   *
   * Every row carries a value in every column, so `desc` really is the
   * reverse of `asc` here — the absent-value rules have their own fixture
   * below (ABSENT_LABEL_ROWS), where they are NOT a reversal.
   */
  const MAIN_SORT: Row[] = [
    conn({
      id: 'c-40',
      label: 'Bravo',
      vertical: 'ecommerce',
      platform: 'asana',
      status: 'platform_error',
      tenantId: 't-delta',
      createdAt: '2026-01-02T09:00:00.000Z',
    }),
    conn({
      id: 'c-10',
      label: 'Delta',
      vertical: 'logistics',
      platform: 'nutshell',
      status: 'expired',
      tenantId: 't-charlie',
      createdAt: '2026-01-04T09:00:00.000Z',
    }),
    conn({
      id: 'c-30',
      label: 'Alpha',
      vertical: 'crm',
      platform: 'shopify',
      status: 'expiring_soon',
      tenantId: 't-alpha',
      createdAt: '2026-01-03T09:00:00.000Z',
    }),
    conn({
      id: 'c-20',
      label: 'Charlie',
      vertical: 'accounting',
      platform: 'fortnox',
      status: 'valid',
      tenantId: 't-bravo',
      createdAt: '2026-01-01T09:00:00.000Z',
    }),
  ]

  it.each([
    { key: 'id', expected: ['c-10', 'c-20', 'c-30', 'c-40'] },
    { key: 'label', expected: ['c-30', 'c-40', 'c-20', 'c-10'] },
    { key: 'vertical', expected: ['c-20', 'c-30', 'c-40', 'c-10'] },
    { key: 'platform', expected: ['c-40', 'c-20', 'c-10', 'c-30'] },
    { key: 'status', expected: ['c-10', 'c-30', 'c-40', 'c-20'] },
    { key: 'tenant', expected: ['c-30', 'c-20', 'c-10', 'c-40'] },
    { key: 'created', expected: ['c-20', 'c-40', 'c-30', 'c-10'] },
  ])('sorts by $key on its own field, not a neighbouring one', async ({ key, expected }) => {
    const app = await makeApp(MAIN_SORT)
    const asc = await list(app, `?sort=${key}&dir=asc`)
    expect(asc.statusCode).toBe(200)
    expect(ids(asc.body.data)).toEqual(expected)
    const desc = await list(app, `?sort=${key}&dir=desc`)
    expect(ids(desc.body.data)).toEqual([...expected].reverse())
  })

  // The order every case above has to differ from, so none of them can be
  // satisfied by the sort being dropped altogether.
  it('returns the same fixture in upstream order with no sort', async () => {
    const app = await makeApp(MAIN_SORT)
    expect(ids((await list(app, '')).body.data)).toEqual(['c-40', 'c-10', 'c-30', 'c-20'])
  })

  /**
   * The map itself, pinned literally — the counterpart of
   * `AUDIT_SORT_COLUMNS`/`SYNC_SORT_COLUMNS`' `toEqual` assertions. Those two
   * map a UI key to a column NAME, which compares directly; this one maps to
   * an accessor, so the comparison runs each accessor over a row whose every
   * field carries a distinct sentinel. A key pointed at a neighbouring field
   * returns that neighbour's sentinel and the whole object mismatches.
   *
   * It catches something the behavioural cases above cannot: a key REMOVED
   * from the map is simply ignored by the route (an unrecognised key falls
   * back to the default order, by design), so `?sort=tenant` would still
   * answer 200 with a plausible page.
   */
  it('maps each UI key to the field it claims, and offers no others', async () => {
    const sentinel = conn({
      id: 's-id',
      label: 's-label',
      vertical: 's-vertical',
      platform: 's-platform',
      status: 's-status',
      tenantId: 's-tenant',
      createdAt: 's-created',
    }) as never
    const read = Object.fromEntries(
      Object.entries(CONNECTION_SORT_ACCESSORS).map(([key, get]) => [key, get(sentinel)]),
    )
    expect(read).toEqual({
      label: 's-label',
      id: 's-id',
      vertical: 's-vertical',
      platform: 's-platform',
      status: 's-status',
      tenant: 's-tenant',
      created: 's-created',
    })
  })

  // The three accessors carrying a `?? ''` fallback. The empty string is what
  // the comparator treats as absent (sorted last in both directions, see
  // ABSENT_LABEL_ROWS below); returning `null` there instead would make
  // `!av` still true but `av.localeCompare` throw on the branch where only
  // one side is absent.
  it('reads an absent label, tenant or createdAt as the empty string, never null', () => {
    const empty = conn({ id: 'x', label: null, tenantId: null, createdAt: null as never }) as never
    expect(CONNECTION_SORT_ACCESSORS.label(empty)).toBe('')
    expect(CONNECTION_SORT_ACCESSORS.tenant(empty)).toBe('')
    expect(CONNECTION_SORT_ACCESSORS.created(empty)).toBe('')
  })

  it('sorts before paginating, so page 2 is a slice of the sorted set', async () => {
    const app = await makeApp(MAIN)
    // Ascending label order is c-1000, c-2000, c-3000, c-4000 (established
    // above). With limit=2, page 2 must be the LAST two of that sorted
    // order, not the last two of the upstream (unsorted) order. Every other
    // test in this file uses the default limit (50) against a <=4-row
    // fixture, so `slice(0, 50)` is the identity there and would stay green
    // even if sorting moved below the slice — this is the one test that
    // fails if that ordering regresses.
    const { statusCode, body } = await list(app, '?sort=label&dir=asc&limit=2&page=2')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000', 'c-4000'])
  })
})

describe('GET /api/connections?f_label=', () => {
  it('narrows to a substring match and excludes the non-matching rows', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?f_label=ravo')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-2000'])
    // The excluded row's distinguishing text must not leak through.
    expect(JSON.stringify(body.data)).not.toContain('Charlie')
  })

  it('reflects the filtered count in meta.total, not the unfiltered one', async () => {
    const app = await makeApp(MAIN)
    const { body } = await list(app, '?f_label=ravo')
    expect(body.meta.total).toBe(1)
  })
})

describe('GET /api/connections?search= combined with a per-column filter', () => {
  it('still matches id-or-label the same way it does today', async () => {
    const app = await makeApp(MAIN)
    const byLabel = await list(app, '?search=inc')
    expect(ids(byLabel.body.data)).toEqual(['c-1000'])
    const byIdPrefix = await list(app, '?search=c-30')
    expect(ids(byIdPrefix.body.data)).toEqual(['c-3000'])
  })
})

// `search=a&f_label=b`: a fixture where search-alone, f_label-alone, and the
// correct AND-combination each pick out a DIFFERENT set, so the assertion
// below can't pass under any of the two wrong implementations.
//   - c-combo-a: id/label contain "a", not "b"  → search=a only
//   - c-combo-ab: id/label contain both         → search=a AND f_label=b
//   - c-combo-b: id/label contain "b", not "a"  → f_label=b only
const SEARCH_FILTER_COMBO: Row[] = [
  conn({ id: 'c-combo-a', label: 'Alpha Inc' }),
  conn({ id: 'c-combo-ab', label: 'Bravo LLC' }),
  conn({ id: 'c-combo-b', label: 'Bob' }),
]

describe('GET /api/connections?search=a&f_label=b', () => {
  it('combines both filters (AND), rather than either one winning outright', async () => {
    const app = await makeApp(SEARCH_FILTER_COMBO)
    // search=a alone: the two rows whose id/label contain "a".
    const searchOnly = await list(app, '?search=a')
    expect(ids(searchOnly.body.data)).toEqual(['c-combo-a', 'c-combo-ab'])
    // f_label=b alone: the two rows whose label contains "b".
    const filterOnly = await list(app, '?f_label=b')
    expect(ids(filterOnly.body.data)).toEqual(['c-combo-ab', 'c-combo-b'])
    // Both together: only the row in BOTH sets. If `search` silently won
    // outright (f_label dropped), this would include c-combo-a; if
    // `f_label` silently won outright (search dropped), this would include
    // c-combo-b. Only the true intersection matches.
    const combined = await list(app, '?search=a&f_label=b')
    expect(ids(combined.body.data)).toEqual(['c-combo-ab'])
  })
})

describe('GET /api/connections?f_id= / ?f_vertical= / ?f_platform=', () => {
  // Minimal wiring coverage: each of these three binds to the right field
  // and actually narrows the result. A silently mis-wired or dropped filter
  // still answers 200 with the full, unfiltered set — these would each fail
  // (return all 4 rows) if that happened.
  it('f_id narrows by a substring match against the connection id', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?f_id=c-30')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000'])
  })

  it('f_platform narrows by a substring match against the platform slug', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?f_platform=shop')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-2000'])
  })
})

describe('GET /api/connections repeated query key', () => {
  it('does not 400 on a repeated f_label key, and takes the last value', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?f_label=alp&f_label=ravo')
    // `page`/`limit`/`search` are bare `z.string()` today, and a repeated key
    // for any of them IS a 400 (verified against this same route). The new
    // params tolerate it instead, matching the admin app's own query parser
    // (`one()` in table-controls.ts), which also takes the last value.
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-2000'])
  })
})

describe('whitespace-padded values', () => {
  // table-controls.ts trims every value it parses out of the URL before
  // rendering a filter chip or building a sort link, so the API must trim
  // the same way — otherwise a padded value (e.g. carried through a form
  // submit) renders as "applied" in the admin UI while the API silently
  // matches nothing.
  it('trims an exact filter before comparing', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?f_status=%20valid%20')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000'])
  })

  it('trims the sort key and direction before comparing', async () => {
    const app = await makeApp(MAIN)
    const { statusCode, body } = await list(app, '?sort=%20label%20&dir=%20desc%20')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-3000', 'c-2000', 'c-1000', 'c-4000'])
  })
})

// ── f_status: exact match, not substring ────────────────────────────────────
//
// `status` is serialized through a strict Zod enum (`ConnectionStatus`), so a
// row outside it 500s on the way out ("Response does not match the schema" —
// verified empirically against this route). That makes the canary row below
// a stronger failure signal than a body-shape assertion: if `f_status` ever
// regresses to a substring match, the canary is no longer excluded, its
// invalid status reaches serialization, and the endpoint answers 500 instead
// of 200 — so this test fails either way the regression could manifest.
const STATUS_CANARY: Row[] = [
  conn({ id: 'c-real', label: 'Real', status: 'valid' }),
  conn({ id: 'c-canary', label: 'Canary', status: 'valid_extra' }),
]

describe('GET /api/connections?f_status=', () => {
  it('matches exactly, excluding a status that merely contains it as a substring', async () => {
    const app = await makeApp(STATUS_CANARY)
    const { statusCode, body } = await list(app, '?f_status=valid')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-real'])
  })
})

// ── f_vertical: exact match, not substring ──────────────────────────────────
//
// Same idiom as STATUS_CANARY, chosen because MAIN's real verticals
// (accounting/payments/ecommerce/crm) have no prefix relationship, so
// `?f_vertical=accounting` against MAIN happened to return the same single
// row under an exact match AND a substring match — passing whichever way
// the filter is implemented. None of OpenSteward's nine real verticals is a
// strict prefix of another either, so — unlike f_status, where
// `valid`/`valid_extra` also doubles as a 500 canary against
// `ConnectionStatus`'s strict output enum — there's no real value pair to
// reach for and no equivalent 500 signal (`vertical` is a plain `z.string()`
// on the way out, `_openapi.ts`). The invented `accounting_extra` still does
// the one thing that matters: it carries the filtered value as a strict
// prefix, so a regression to substring matching stops excluding it.
const VERTICAL_CANARY: Row[] = [
  conn({ id: 'c-real', label: 'Real', vertical: 'accounting' }),
  conn({ id: 'c-canary', label: 'Canary', vertical: 'accounting_extra' }),
]

describe('GET /api/connections?f_vertical=', () => {
  it('matches exactly, excluding a vertical that merely contains it as a substring', async () => {
    const app = await makeApp(VERTICAL_CANARY)
    const { statusCode, body } = await list(app, '?f_vertical=accounting')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-real'])
  })
})

// ── f_tenant: exact match, not substring ────────────────────────────────────

const TENANT_ROWS: Row[] = [
  conn({ id: 'c-t1', tenantId: 'acme' }),
  conn({ id: 'c-t2', tenantId: 'acme-west' }),
]

describe('GET /api/connections?f_tenant=', () => {
  it('matches the tenant id exactly, not as a prefix', async () => {
    const app = await makeApp(TENANT_ROWS)
    const { statusCode, body } = await list(app, '?f_tenant=acme')
    expect(statusCode).toBe(200)
    expect(ids(body.data)).toEqual(['c-t1'])
  })
})

// ── Absent values sort last, in BOTH directions ─────────────────────────────

const ABSENT_LABEL_ROWS: Row[] = [
  conn({ id: 'c-z', label: 'Zulu' }),
  conn({ id: 'c-a', label: 'Alpha' }),
  conn({ id: 'c-none', label: null }),
]

describe('GET /api/connections?sort=label — unlabelled rows', () => {
  it('sorts last ascending', async () => {
    const app = await makeApp(ABSENT_LABEL_ROWS)
    const { body } = await list(app, '?sort=label&dir=asc')
    // A comparator that plainly did `(a.label ?? '').localeCompare(b.label ??
    // '') * sign` without special-casing missing values would put the
    // unlabelled row FIRST here (an empty string sorts before any letter
    // ascending), failing this assertion.
    expect(ids(body.data)).toEqual(['c-a', 'c-z', 'c-none'])
  })

  it('sorts last descending too — direction must not move it to the front', async () => {
    const app = await makeApp(ABSENT_LABEL_ROWS)
    const { body } = await list(app, '?sort=label&dir=desc')
    // A descending sort implemented as "reverse the ascending result" (a
    // plausible naive alternative) would move the unlabelled row, which is
    // last ascending, to the FRONT here — failing this assertion.
    expect(ids(body.data)).toEqual(['c-z', 'c-a', 'c-none'])
  })
})

// ── Stable ties keep the upstream order ─────────────────────────────────────

const TIE_ROWS: Row[] = [
  conn({ id: 'z-first', label: 'Same', updatedAt: '2026-02-05T10:00:00.000Z' }),
  conn({ id: 'a-second', label: 'Same', updatedAt: '2026-02-04T10:00:00.000Z' }),
]

describe('GET /api/connections?sort=label — ties', () => {
  it('keeps the upstream order for equal sort keys, without a secondary tiebreaker', async () => {
    const app = await makeApp(TIE_ROWS)
    const { body } = await list(app, '?sort=label&dir=asc')
    // The ids are deliberately out of alphabetical order (z-first before
    // a-second) relative to the upstream array: a comparator that fell back
    // to `|| a.id.localeCompare(b.id)` on a tie would reorder these to
    // [a-second, z-first], failing this assertion. V8's sort is stable, so
    // a comparator that returns 0 for the tie must leave them as-is.
    expect(ids(body.data)).toEqual(['z-first', 'a-second'])
  })
})
