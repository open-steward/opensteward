/**
 * Paydock list paging: 1-based `page` + caller's `limit` → `skip` + `limit`.
 *
 * Paydock's own API reference (the Postman collection behind
 * https://documenter.getpostman.com/view/6912944/Uyr5my5q, JSON at
 * https://documenter.gw.postman.com/api/collections/6912944/Uyr5my5q) documents,
 * on customers/search, charges/search and subscriptions/search:
 *
 *   skip   "Pagination parameter to skip first n customers from list, default = 0"
 *          "A pagination parameter to skip first N transactions from the list, default = 0"
 *          "A pagination parameter to skip the first N subscriptions from the list, default = 0"
 *   limit  "... limit output to n , default = 100 , maximum value = 1000"
 *
 * and answers with `{ status, error, resource: { type, data, count, limit, skip } }`,
 * where `count` is the number of matching rows across all pages.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { PaydockAdapter } from '../../../../../../src/verticals/payments/adapters/paydock/index'

const MAX = 1000
const CREDS: Credentials = { accessToken: 'sk_test_paydock' }

type Method = 'listCustomers' | 'listCharges' | 'listSubscriptions'

interface Case {
  method: Method
  path: string
  prefix: string
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers', prefix: 'cus' },
  { method: 'listCharges', path: '/charges', prefix: 'chg' },
  { method: 'listSubscriptions', path: '/subscriptions', prefix: 'sub' },
]

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(5, '0')}`)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/**
 * A fake Paydock holding `n` rows per collection, reading ONLY the documented
 * `skip` (default 0) and `limit` (default 100, maximum 1000) query parameters.
 */
function fakePaydock(n: number, opts: { omitCount?: boolean } = {}) {
  const sent: Array<{ path: string; params: Record<string, unknown> }> = []
  const rows: Record<string, string[]> = {
    '/customers': makeIds('cus', n),
    '/charges': makeIds('chg', n),
    '/subscriptions': makeIds('sub', n),
  }
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const q = { ...(config?.params ?? {}) }
    sent.push({ path, params: q })
    const all = rows[path]
    if (!all) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    const limit = q.limit === undefined ? 100 : Number(q.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw badRequest(`limit ${String(q.limit)}`)
    const skip = q.skip === undefined ? 0 : Number(q.skip)
    if (!Number.isInteger(skip) || skip < 0) throw badRequest(`skip ${String(q.skip)}`)
    // Minimal rows carrying the fields each resource table marks required
    // ("+"): charges need amount/currency, subscriptions customer.customer_id.
    const data = all
      .slice(skip, skip + limit)
      .map((id) =>
        path === '/charges'
          ? { _id: id, amount: 10, currency: 'AUD', status: 'complete' }
          : path === '/subscriptions'
            ? { _id: id, status: 'active', customer: { customer_id: '5ef064763dcfec0ac5e0622b' } }
            : { _id: id },
      )
    return {
      data: {
        status: 200,
        error: null,
        resource: opts.omitCount
          ? { type: 'list', data, limit, skip }
          : { type: 'list', data, count: all.length, limit, skip },
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
  return { sent }
}

async function callPage(adapter: PaydockAdapter, method: Method, page: number, limit: number) {
  const params = withPageSink({ page, limit })
  const items = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Paydock $method paging', ({ method, path, prefix }) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    fakePaydock(2 * L + 1)
    const adapter = new PaydockAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(prefix, 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
  })

  it('ends on resource.count when the last page is exactly full', async () => {
    const L = 3
    fakePaydock(2 * L)
    const adapter = new PaydockAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    expect([...p1.ids, ...p2.ids]).toEqual(makeIds(prefix, 2 * L))
    expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
    expect(readUpstreamPage(p2.params)?.totalCount).toBe(2 * L)
  })

  it('without resource.count, ends only on a short page and claims nothing on a full one', async () => {
    const L = 3
    fakePaydock(2 * L + 1, { omitCount: true })
    const adapter = new PaydockAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(prefix, 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([undefined, undefined, false])
  })

  it('page 2 sends skip = limit on the documented endpoint', async () => {
    const L = 4
    const { sent } = fakePaydock(10)
    const adapter = new PaydockAdapter()
    await callPage(adapter, method, 1, L)
    expect(sent[0]).toEqual({
      path,
      params: { limit: L, skip: 0, sortkey: 'created_at', sortdirection: 'ASC' },
    })
    sent.length = 0
    const p2 = await callPage(adapter, method, 2, L)
    expect(sent).toEqual([
      { path, params: { limit: L, skip: L, sortkey: 'created_at', sortdirection: 'ASC' } },
    ])
    expect(p2.ids).toEqual(makeIds(prefix, 10).slice(L, 2 * L))
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const n = 2 * MAX + 1
    const { sent } = fakePaydock(n)
    const adapter = new PaydockAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, method, k, 5000))
    expect(sent.every((s) => Number(s.params.limit) <= MAX)).toBe(true)
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds(prefix, n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakePaydock(5)
    const adapter = new PaydockAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'paydock')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r2 = await run(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})
