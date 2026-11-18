/**
 * IntaSend paging contract: listRefunds, listDisputes, listInvoices,
 * listPayouts, listSubscriptions, listBalanceTransactions, listCustomers,
 * listPlans.
 *
 * Customers and plans live at the hyphenated paths the spec documents,
 * "/api/v1/subscriptions-customers/" (api_v1_subscriptions_customers_list) and
 * "/api/v1/subscriptions-plans/" (api_v1_subscriptions_plans_list); the fake
 * serves nothing at the old "/subscriptions/customers/" and "/subscriptions/plans/".
 *
 * Each lists a DRF-style page-number collection documented in IntaSend's
 * OpenAPI spec (https://developers.intasend.com/reference/api_v1_chargebacks_list
 * and the matching *_list pages):
 *
 *   {"name":"page","required":false,"in":"query","description":"A page number
 *    within the paginated result set.","schema":{"type":"integer"}}
 *   "Paginated…List":{"type":"object","required":["count","results"],
 *    "properties":{"count":…,"next":{"type":"string","nullable":true,…}
 *
 * `page` is the only paging parameter: there is no page size, so the server's
 * page size is fixed. The adapter walks upstream pages by `page` and cuts the
 * caller's rows out of them with pageByRows, ending on a null `next`.
 *
 * The fake below honours ONLY `page`: any other query parameter is refused,
 * and it serves a fixed server page size the caller cannot change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { IntasendAdapter } from '../../../../../../src/verticals/payments/adapters/intasend/index'

const CREDS = { accessToken: 'ISSecretKey_test_abc', extra: { sandbox: false } }
/** The server's fixed page size; the API documents no parameter to change it. */
const SERVER_PAGE = 10

type ListFn =
  | 'listRefunds'
  | 'listDisputes'
  | 'listInvoices'
  | 'listPayouts'
  | 'listSubscriptions'
  | 'listBalanceTransactions'
  | 'listCustomers'
  | 'listPlans'

const PATHS: Record<ListFn, string> = {
  listRefunds: '/chargebacks/',
  listDisputes: '/chargebacks/',
  listInvoices: '/invoices/',
  listPayouts: '/send-money/transactions/',
  listSubscriptions: '/subscriptions/',
  listBalanceTransactions: '/transactions/',
  listCustomers: '/subscriptions-customers/',
  listPlans: '/subscriptions-plans/',
}

/**
 * One row of a collection, keyed by its id. Customers and plans carry the
 * documented id field and required fields of CustomerSer / PlanSer (their
 * transforms throw without them); the other collections' rows are `{ id }`.
 */
function row(path: string, id: string): Record<string, unknown> {
  if (path === '/subscriptions-customers/') {
    return {
      customer_id: id,
      email: 'user@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      created_at: '2023-10-09T06:57:02.018Z',
      updated_at: '2023-10-09T06:57:02.018Z',
    }
  }
  if (path === '/subscriptions-plans/') {
    return {
      plan_id: id,
      name: 'Basic',
      frequency: 1,
      frequency_unit: 'M',
      currency: 'KES',
      amount: '1000.00',
      created_at: '2023-10-05T10:25:25.499093+03:00',
      updated_at: '2023-10-05T10:25:25.499123+03:00',
    }
  }
  return { id }
}

const METHODS = Object.keys(PATHS) as ListFn[]

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

/** A fake GET of one DRF list endpoint holding `ids`. */
function fakeList(path: string, ids: string[]): { reqs: Req[] } {
  return fakeLists({ [path]: ids })
}

/** A fake GET of several DRF list endpoints, each holding its own ids. */
function fakeLists(collections: Record<string, string[]>): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    reqs.push({ path: p, params: params ? { ...params } : undefined })
    const ids = collections[p]
    if (!ids) throw new Error(`unexpected path ${p}`)
    const path = p
    for (const k of Object.keys(params ?? {})) {
      if (k !== 'page') throw new Error(`undocumented query parameter ${k}`)
    }
    const raw = params?.page
    const page = raw === undefined ? 1 : Number(raw)
    const pages = Math.max(1, Math.ceil(ids.length / SERVER_PAGE))
    if (!Number.isInteger(page) || page < 1 || page > pages) {
      throw Object.assign(new Error('Invalid page.'), { response: { status: 404 } })
    }
    const from = (page - 1) * SERVER_PAGE
    const base = `https://payment.intasend.com/api/v1${path}`
    return {
      data: {
        count: ids.length,
        next: page < pages ? `${base}?page=${page + 1}` : null,
        previous: page > 1 ? `${base}?page=${page - 1}` : null,
        results: ids.slice(from, from + SERVER_PAGE).map((id) => row(path, id)),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { reqs }
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row-${String(i).padStart(4, '0')}`)
}

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new IntasendAdapter()
  const out: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const rows = await adapter[method](CREDS, params)
    sizes.push(rows.length)
    out.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe.each(METHODS)('IntaSend %s paging', (method) => {
  const path = PATHS[method]

  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    fakeList(path, all)
    const { ids: got, hasMore, sizes } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves 2L+1 rows once each when L spans several server pages', async () => {
    const L = 25
    const all = ids(2 * L + 1)
    fakeList(path, all)
    const { ids: got, hasMore, sizes } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented `page` key on the request behind caller page 2', async () => {
    const L = SERVER_PAGE
    const { reqs } = fakeList(path, ids(2 * L + 1))
    const adapter = new IntasendAdapter()
    await adapter[method](CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const before = reqs.length
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(2 * L + 1).slice(L, 2 * L))
    const pages = reqs.map((r) => r.params?.page)
    expect(pages).toContain(2)
    // Page 2 is either served from the peeked upstream page 2 or fetches page 3.
    expect(reqs.slice(before).every((r) => (r.params?.page as number) >= 2)).toBe(true)
  })

  it('serves a page asked for cold, with no earlier page in memory', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    const { reqs } = fakeList(path, all)
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await new IntasendAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.map((r) => r.params?.page)).toContain(2)
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = SERVER_PAGE
    const all = ids(2 * L)
    fakeList(path, all)
    const { ids: got, hasMore } = await drive(method, L, 2)
    expect(got).toEqual(all)
    expect(hasMore).toEqual([true, false])
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const all = ids(1201)
    fakeList(path, all)
    const adapter = new IntasendAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = parseListQuery(
        { limit: '5000', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      expect(p.limit).toBe(500)
      const rows = await adapter[method](CREDS, p)
      expect(rows.length).toBeLessThanOrEqual(500)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(got).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const all = ids(7)
    fakeList(path, all)
    const adapter = new IntasendAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage<{ id: string }>(await adapter[method](CREDS, p1), p1, 'intasend')
    expect(e1.data.map((r) => r.id)).toEqual(all.slice(0, 3))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage<{ id: string }>(await adapter[method](CREDS, p3), p3, 'intasend')
    expect(e3.data.map((r) => r.id)).toEqual(all.slice(6))
    expect(e3.meta.hasMore).toBe(false)
  })

  it('never serves one connection the rows another connection fetched', async () => {
    const L = 7
    const a = ids(2 * L + 1)
    const b = a.map((id) => `b-${id}`)
    const adapter = new IntasendAdapter()
    fakeList(path, a)
    await adapter[method](
      { accessToken: 'ISSecretKey_conn_a' },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    vi.restoreAllMocks()
    fakeList(path, b)
    const rows = await adapter[method](
      { accessToken: 'ISSecretKey_conn_b' },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(rows.map((r) => r.id)).toEqual(b.slice(L, 2 * L))
  })
})

describe('IntaSend pager keys and defaults', () => {
  it('never serves one collection the rows another collection fetched on the same connection', async () => {
    const L = 7
    const invoices = ids(2 * L + 1).map((id) => `inv-${id}`)
    const payouts = ids(2 * L + 1).map((id) => `pay-${id}`)
    fakeLists({ '/invoices/': invoices, '/send-money/transactions/': payouts })
    const adapter = new IntasendAdapter()
    await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listPayouts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(payouts.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('keeps a sandbox walk and a live walk apart for the same secret key', async () => {
    const L = 7
    const sandbox = ids(2 * L + 1).map((id) => `sbx-${id}`)
    const live = ids(2 * L + 1).map((id) => `live-${id}`)
    const adapter = new IntasendAdapter()
    fakeList('/invoices/', sandbox)
    await adapter.listInvoices(
      { accessToken: 'ISSecretKey_same', extra: { sandbox: true } },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    vi.restoreAllMocks()
    fakeList('/invoices/', live)
    const rows = await adapter.listInvoices(
      { accessToken: 'ISSecretKey_same', extra: { sandbox: false } },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(rows.map((r) => r.id)).toEqual(live.slice(L, 2 * L))
  })

  it('serves 50 rows (the adapter default) when the caller sends no limit', async () => {
    const all = ids(120)
    fakeList('/invoices/', all)
    const params = withPageSink({ page: 1 } as QueryParams)
    const rows = await new IntasendAdapter().listInvoices(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('refuses a response without the documented `results` array rather than calling it empty', async () => {
    const get = vi.fn(async () => ({ data: [{ id: 'a' }] }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    await expect(
      new IntasendAdapter().listInvoices(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/results/)
  })
})

describe('IntaSend customer and plan retrieve paths', () => {
  function fakeGet(body: unknown): { paths: string[] } {
    const paths: string[] = []
    const get = vi.fn(async (p: string) => {
      paths.push(p)
      return { data: body }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    return { paths }
  }

  it('getCustomer reads /subscriptions-customers/{id}/ (api_v1_subscriptions_customers_retrieve)', async () => {
    const { paths } = fakeGet(row('/subscriptions-customers/', 'KZQ9DL0'))
    const c = await new IntasendAdapter().getCustomer(CREDS, 'KZQ9DL0')
    expect(paths).toEqual(['/subscriptions-customers/KZQ9DL0/'])
    expect(c.id).toBe('KZQ9DL0')
  })

  it('getPlan reads /subscriptions-plans/{id}/ (api_v1_subscriptions_plans_retrieve)', async () => {
    const { paths } = fakeGet(row('/subscriptions-plans/', 'LERG5RK'))
    const p = await new IntasendAdapter().getPlan(CREDS, 'LERG5RK')
    expect(paths).toEqual(['/subscriptions-plans/LERG5RK/'])
    expect(p.id).toBe('LERG5RK')
  })

  // The path parameter is a string id; an id carrying a reserved character
  // must stay one path segment, not reach a different route.
  it('getCustomer escapes the id into a single path segment', async () => {
    const { paths } = fakeGet(row('/subscriptions-customers/', 'a/b?c'))
    await new IntasendAdapter().getCustomer(CREDS, 'a/b?c')
    expect(paths).toEqual(['/subscriptions-customers/a%2Fb%3Fc/'])
  })

  it('getPlan escapes the id into a single path segment', async () => {
    const { paths } = fakeGet(row('/subscriptions-plans/', 'a/b?c'))
    await new IntasendAdapter().getPlan(CREDS, 'a/b?c')
    expect(paths).toEqual(['/subscriptions-plans/a%2Fb%3Fc/'])
  })
})
