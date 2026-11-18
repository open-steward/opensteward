/**
 * `GET /admin/end-users` — repeated query keys, and the count/list pairing.
 *
 * This is the third X-Admin-Secret list route in this package to take
 * per-column filters, and it was the one that fell between the parts. Its two
 * siblings collapse a repeated key with `one()`
 * (`data-store/admin-sync-router.ts`, `control-plane/webhook-subs-admin-router.ts`);
 * this one destructured every param raw, so Fastify's ARRAY for a repeated key
 * reached `EndUserStore` untouched:
 *
 *   ?email=a&email=b                  500  filter.email.toLowerCase is not a function
 *   ?displayName=a&displayName=b      500  filter.displayName.toLowerCase is not a function
 *   ?externalReference=a&...=b        500  filter.externalReference.toLowerCase is not a function
 *   ?q=a&q=b                          500  (the same, pre-existing)
 *   ?tenantId=a&tenantId=b            500  SQLITE_ERROR: row value misused
 *   ?sort=email&sort=displayName      200  sort SILENTLY DROPPED
 *   ?limit=1&limit=2                  200  limit silently reset to the store default
 *
 * The three name crashes arrived with the per-column filters themselves. The
 * two 200s are the quieter half and the worse one: nothing refuses the
 * request, the caller's ordering or page size is simply ignored, and the only
 * evidence is a result set that is wider or differently ordered than asked
 * for.
 *
 * Both halves are pinned below, and so is the count/list pairing — the one
 * assertion the two sibling routers have and this one did not.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'

const SECRET = 'connect-admin-end-users-query-secret-32-ch'

let handle: DbHandle
let fastify: FastifyInstance
let endUsers: EndUserStore

/**
 * Three customers whose every filterable field differs, so a filter wired to
 * the wrong column narrows to the wrong row rather than coincidentally to the
 * right one. `alpha` and `beta` share a tenant; `gamma` does not.
 */
beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  endUsers = await EndUserStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)
  // Explicit `created_at` values, chosen so the DEFAULT order is not sorted by
  // email in either direction.
  //
  // Two reasons. `EndUserStore.create` stamps `Date.now()`, so rows seeded in
  // the same millisecond TIE on the store's default `created_at DESC, id DESC`
  // and the tiebreaker is a `randomUUID` — any assertion about order becomes a
  // coin toss. And the values are deliberately NOT monotonic with the emails:
  // the default order is delta, alpha, gamma, beta, while email ASC is alpha,
  // beta, delta, gamma and email DESC is the reverse. Neither sorted answer
  // can be produced by a dropped sort, in either direction.
  const CREATED_AT: Record<string, number> = {
    'beta@x.test': 1_700_000_000_000,
    'gamma@x.test': 1_700_000_000_001,
    'alpha@x.test': 1_700_000_000_002,
    'delta@x.test': 1_700_000_000_003,
  }
  for (const row of [
    { tenantId: 't-one', email: 'alpha@x.test', displayName: 'Alpha One', externalReference: 'crm-1' },
    { tenantId: 't-one', email: 'beta@x.test', displayName: 'Beta Two', externalReference: 'crm-2' },
    { tenantId: 't-two', email: 'gamma@x.test', displayName: 'Gamma Three', externalReference: 'crm-3' },
    // A FOURTH row exists only so `limit` is observable. With three rows,
    // `limit=2&offset=1` and the store's own 50-row fallback both return two
    // rows — so reverting `one()` on `limit` (making it `Number([...]) ===
    // NaN`) left this file green. Four rows separate them: 2 vs 3.
    { tenantId: 't-two', email: 'delta@x.test', displayName: 'Delta Four', externalReference: 'crm-4' },
  ]) {
    const created = await endUsers.create(row)
    await handle.kysely
      .updateTable('end_users')
      .set({ created_at: CREATED_AT[row.email] })
      .where('id', '=', created.id)
      .execute()
  }

  fastify = Fastify({ logger: false })
  await fastify.register(
    createConnectAdminRouter({
      store: {} as never,
      endUsers,
      sessions,
      getCompanyBaseUrl: () => 'https://oi.acme.example',
    }),
  )
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  await handle?.close()
})

async function list(query: string) {
  const res = await fastify.inject({ method: 'GET', url: `/admin/end-users${query}` })
  return { statusCode: res.statusCode, body: res.json() }
}

const emails = (body: { data: Array<{ email: string }> }) => body.data.map((r) => r.email)

describe('GET /admin/end-users survives a repeated query key', () => {
  /**
   * The three crashes, plus `q` (same shape, pre-existing) and `tenantId`
   * (a different error — `SQLITE_ERROR: row value misused` — because an array
   * reaches a `where(col, '=', …)` rather than a `.toLowerCase()`).
   *
   * The status code comes first, since a 500 is what the bug produced. The
   * VALUE then pins last-wins: the second needle is the one that must take
   * effect, and the first is what a `v[0]` collapse would return — both are
   * "not a crash", so a status-only assertion would pass against either.
   */
  it.each([
    { label: 'email', query: '?email=alpha&email=beta', expected: ['beta@x.test'] },
    { label: 'displayName', query: '?displayName=Alpha&displayName=Beta', expected: ['beta@x.test'] },
    {
      label: 'externalReference',
      query: '?externalReference=crm-1&externalReference=crm-2',
      expected: ['beta@x.test'],
    },
    { label: 'q', query: '?q=alpha&q=beta', expected: ['beta@x.test'] },
  ])('collapses a repeated $label to its LAST value instead of 500ing', async ({ query, expected }) => {
    const res = await list(query)
    expect(res.statusCode).toBe(200)
    expect(emails(res.body)).toEqual(expected)
  })

  it('collapses a repeated tenantId instead of erroring on a row value', async () => {
    const res = await list('?tenantId=t-two&tenantId=t-one')
    expect(res.statusCode).toBe(200)
    // Last-wins picks `t-one`, which holds two of the three customers — a
    // `v[0]` collapse would pick `t-two` and return one.
    expect(emails(res.body).sort()).toEqual(['alpha@x.test', 'beta@x.test'])
    expect(res.body.meta.total).toBe(2)
  })

  /**
   * The quiet half. `END_USER_SORT_KEYS.has(['email','displayName'])` is safely
   * `false`, so a repeated `?sort=` was DISCARDED and the store returned its
   * default `created_at DESC, id DESC` — newest first — while the caller
   * believed they had asked for something else.
   *
   * The default order here is alpha, gamma, beta (see the fixture) — which is
   * email order in NEITHER direction, so a dropped sort cannot coincide with
   * either expected answer. `dir` is repeated too, and the first assertion
   * demands the DESCENDING answer on purpose: a raw array is
   * `['asc','desc'] !== 'desc'`, which normalises to `undefined` and reads as
   * ascending, so asserting ascending alone would be asserting the broken
   * path's own output.
   */
  it('applies the last sort and dir rather than silently falling back to the default order', async () => {
    const res = await list('?sort=nope&sort=email&dir=asc&dir=desc')
    expect(res.statusCode).toBe(200)
    expect(emails(res.body)).toEqual([
      'gamma@x.test',
      'delta@x.test',
      'beta@x.test',
      'alpha@x.test',
    ])

    const asc = await list('?sort=nope&sort=email&dir=desc&dir=asc')
    expect(emails(asc.body)).toEqual([
      'alpha@x.test',
      'beta@x.test',
      'delta@x.test',
      'gamma@x.test',
    ])
  })

  /**
   * The other quiet half. `Number(['1','2'])` is `NaN`, which
   * `EndUserStore.list` clamps back to its own 50-row default — so a repeated
   * `?limit=` served every row instead of the page asked for. Last-wins gives
   * limit 2, offset 1: rows 2 and 3 of the default order (delta, alpha, gamma,
   * beta). A `v[0]` collapse gives limit 1, offset 0 — one row, and a
   * different one — and a dropped `one()` gives `Number([...]) === NaN`, which
   * the store replaces with its own 50-row default: THREE rows from offset 1.
   * Asserting exactly these two separates the fix from both.
   */
  it('pages on the last value of a repeated limit and offset', async () => {
    const res = await list('?limit=1&limit=2&offset=0&offset=1')
    expect(res.statusCode).toBe(200)
    expect(emails(res.body)).toEqual(['alpha@x.test', 'gamma@x.test'])
    expect(res.body.meta.total).toBe(4)
  })
})

describe('GET /admin/end-users counts what it lists', () => {
  /**
   * `meta.total` must come from `countEndUsers(filter)` over the SAME
   * predicate the page was fetched with. Mutating that call to
   * `countEndUsers({})` left all 1776 shared tests green — the identical
   * mutation on the two sibling routers turns two tests red each, which is
   * what this test brings this route level with.
   *
   * The filter deliberately matches a STRICT SUBSET (2 of 3) and the limit is
   * larger than the page, so the expected total is neither the table size nor
   * the page length: an unfiltered count answers 3 and a `data.length` answer
   * would still be 2, so the row count is asserted alongside it.
   */
  it('reports the count of rows matching the filter, not of every row', async () => {
    const res = await list('?tenantId=t-one&limit=50')
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.meta.total).toBe(2)
  })

  /**
   * And the page size must not become the total either. Same filter, a page
   * smaller than the match set: two rows match, one is returned, the total is
   * still two.
   */
  it('reports the matching total even when the page is smaller than the match set', async () => {
    const res = await list('?tenantId=t-one&limit=1')
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta.total).toBe(2)
  })

  it('counts a text filter the same way, not just the tenant scope', async () => {
    const res = await list('?email=alpha')
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta.total).toBe(1)
  })
})
