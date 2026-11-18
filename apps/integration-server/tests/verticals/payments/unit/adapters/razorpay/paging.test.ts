/**
 * Razorpay list paging: 1-based `page` + caller's `limit` → Razorpay's
 * uniform `count` / `skip` offset scheme.
 *
 *   "Number of entities to fetch. Default is 10. This can be used for
 *   pagination, in combination with `skip`." / "Number of entities to skip.
 *   Default is 0. This can be used for pagination, in combination with
 *   `count`." (https://razorpay.com/docs/api/understand/, Pagination)
 *
 * Every per-endpoint page that states a maximum states 100 (customers,
 * payments, refunds, subscriptions, plans, payouts, settlements). A
 * collection is `{ entity: 'collection', count, items }`, where `count` is
 * the number of items in THIS response: there is no total and no has_more.
 *
 * Payment methods are customer tokens (GET /customers/:id/tokens, no paging
 * parameters), flattened out of the customer pages. Invoice line items are
 * embedded whole in GET /invoices/:id ("Maximum of 50 line items").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { RazorpayAdapter } from '../../../../../../src/verticals/payments/adapters/razorpay/index'

const MAX = 100

const CREDS: Credentials = { accessToken: 'cnpwX3Rlc3Q6c2VjcmV0' }

type OffsetMethod =
  | 'listCharges'
  | 'listRefunds'
  | 'listCustomers'
  | 'listSubscriptions'
  | 'listPlans'
  | 'listInvoices'
  | 'listPayouts'
  | 'listDisputes'
  | 'listBalanceTransactions'

interface Case {
  method: OffsetMethod
  path: string
  prefix: string
}

const CASES: Case[] = [
  { method: 'listCharges', path: '/payments', prefix: 'pay' },
  { method: 'listRefunds', path: '/refunds', prefix: 'rfnd' },
  { method: 'listCustomers', path: '/customers', prefix: 'cust' },
  { method: 'listSubscriptions', path: '/subscriptions', prefix: 'sub' },
  { method: 'listPlans', path: '/plans', prefix: 'plan' },
  { method: 'listInvoices', path: '/invoices', prefix: 'inv' },
  { method: 'listPayouts', path: '/payouts', prefix: 'pout' },
  { method: 'listDisputes', path: '/disputes', prefix: 'disp' },
  { method: 'listBalanceTransactions', path: '/settlements', prefix: 'setl' },
]

interface Sent {
  path: string
  params: Record<string, unknown>
  auth: string
}

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/** `count`: default 10, 1..100; a value outside that is a 400. */
function countOf(raw: unknown): number {
  const n = raw === undefined ? 10 : Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > MAX) throw badRequest(`count ${String(raw)}`)
  return n
}

/** `skip`: default 0. */
function skipOf(raw: unknown): number {
  const n = raw === undefined ? 0 : Number(raw)
  if (!Number.isInteger(n) || n < 0) throw badRequest(`skip ${String(raw)}`)
  return n
}

interface FakeOptions {
  /** Tokens per customer, by customer index (default 0). */
  tokensPerCustomer?: (i: number) => number
  /** Customers in the account when paging payment methods (default n). */
  customers?: number
  /** Line items embedded in each invoice. */
  lineItems?: number
  /** Customers (by index) the listing returns without an `id`; they hold no tokens. */
  noIdAt?: (i: number) => boolean
  /** Prefix every token id with the request's Authorization, so each connection sees its own. */
  tokensByAuth?: boolean
}

/**
 * A fake Razorpay holding `n` rows in each offset collection, which reads
 * ONLY `count` and `skip` (and ignores everything else it is sent).
 */
function fakeRazorpay(n: number, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const collections: Record<string, Array<{ id: string }>> = {}
  for (const c of CASES) collections[c.path] = makeIds(c.prefix, n).map((id) => ({ id }))
  const customerCount = opts.customers ?? n
  collections['/customers'] = makeIds('cust', Math.max(n, customerCount)).map((id, i) =>
    opts.noIdAt?.(i) ? ({} as { id: string }) : { id },
  )
  const customers = collections['/customers'].slice(0, customerCount)
  const tokens = new Map<string, Array<{ id: string }>>()
  let tokenNo = 0
  customers.forEach((c, i) => {
    if (!c.id) return
    const k = opts.tokensPerCustomer?.(i) ?? 0
    tokens.set(
      c.id,
      Array.from({ length: k }, () => ({ id: `token_${String(++tokenNo).padStart(4, '0')}` })),
    )
  })
  const get = (auth: string) =>
    vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const q = { ...(config?.params ?? {}) }
      sent.push({ path, params: q, auth })
      const tok = /^\/customers\/([^/]+)\/tokens$/.exec(path)
      if (tok) {
        const own = tokens.get(tok[1]!) ?? []
        const items = opts.tokensByAuth ? own.map((t) => ({ id: `${auth}|${t.id}` })) : own
        return { data: { entity: 'collection', count: items.length, items } }
      }
      const inv = /^\/invoices\/([^/]+)$/.exec(path)
      if (inv) {
        const items = makeIds('li', opts.lineItems ?? 0).map((id) => ({ id, name: id }))
        return { data: { id: inv[1], line_items: items } }
      }
      const pool =
        path === '/customers' && opts.customers !== undefined ? customers : collections[path]
      if (!pool) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      const count = countOf(q.count)
      const skip = skipOf(q.skip)
      const items = pool.slice(skip, skip + count)
      return { data: { entity: 'collection', count: items.length, items } }
    })
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const auth = String(config?.headers?.Authorization ?? '')
    return { get: get(auth), post: vi.fn() }
  }) as never)
  return { sent, tokenIds: [...tokens.values()].flat().map((t) => t.id) }
}

async function callPage(
  adapter: RazorpayAdapter,
  call: (params: QueryParams) => Promise<Array<{ id: string }>>,
  page: number,
  limit: number,
) {
  const params = withPageSink({ page, limit })
  const items = await call(params)
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

function offsetCall(adapter: RazorpayAdapter, method: OffsetMethod) {
  return (params: QueryParams) => adapter[method](CREDS, params) as Promise<Array<{ id: string }>>
}

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Razorpay $method paging (count/skip)', ({ method, path, prefix }) => {
  it('serves 2L+1 rows over three pages, each id once, in order', async () => {
    const L = 3
    fakeRazorpay(2 * L + 1)
    const adapter = new RazorpayAdapter()
    const call = offsetCall(adapter, method)
    const p1 = await callPage(adapter, call, 1, L)
    const p2 = await callPage(adapter, call, 2, L)
    const p3 = await callPage(adapter, call, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(prefix, 2 * L + 1))
    // No total and no has_more: a full page is undecidable, a short one is the end.
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([undefined, undefined, false])
    const p4 = await callPage(adapter, call, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('page 2 sends skip = limit with count = limit', async () => {
    const L = 4
    const { sent } = fakeRazorpay(10)
    const adapter = new RazorpayAdapter()
    const call = offsetCall(adapter, method)
    await callPage(adapter, call, 1, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.params).toMatchObject({ count: L, skip: 0 })
    sent.length = 0
    const p2 = await callPage(adapter, call, 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(path)
    expect(sent[0]!.params).toMatchObject({ count: L, skip: L })
    expect(p2.ids).toEqual(makeIds(prefix, 10).slice(L, 2 * L))
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const n = 2 * MAX + 1
    const { sent } = fakeRazorpay(n)
    const adapter = new RazorpayAdapter()
    const call = offsetCall(adapter, method)
    const pages = []
    for (let k = 1; k <= 4; k++) pages.push(await callPage(adapter, call, k, 1000))
    expect(sent.every((s) => Number(s.params.count) <= MAX)).toBe(true)
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds(prefix, n))
    expect(new Set(all).size).toBe(n)
    expect(pages.map((p) => p.hasMore)).toEqual([undefined, undefined, false, false])
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeRazorpay(5)
    const adapter = new RazorpayAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'razorpay')
    }
    const r2 = await run(2)
    expect((r2.data as Array<{ id: string }>).map((r) => r.id)).toEqual(
      makeIds(prefix, 5).slice(2, 4),
    )
    expect(r2.meta.hasMore).toBe(null)
    const r3 = await run(3)
    expect((r3.data as Array<{ id: string }>).map((r) => r.id)).toEqual([`${prefix}_0005`])
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Razorpay listPaymentMethods paging (tokens flattened from customers)', () => {
  const call = (adapter: RazorpayAdapter) => (params: QueryParams) =>
    adapter.listPaymentMethods(CREDS, params)

  it('serves 2L+1 tokens over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    // 7 tokens across 6 customers: 2, 0, 1, 2, 0, 2.
    const perCustomer = [2, 0, 1, 2, 0, 2]
    const { tokenIds } = fakeRazorpay(6, { tokensPerCustomer: (i) => perCustomer[i] ?? 0 })
    expect(tokenIds).toHaveLength(2 * L + 1)
    const adapter = new RazorpayAdapter()
    const p1 = await callPage(adapter, call(adapter), 1, L)
    const p2 = await callPage(adapter, call(adapter), 2, L)
    const p3 = await callPage(adapter, call(adapter), 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(tokenIds)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
  })

  it('walks past the first 100 customers with skip, and the next customer page carries it', async () => {
    // One token per customer, 250 customers: rows 101..250 used to be unreachable.
    const { sent, tokenIds } = fakeRazorpay(250, { tokensPerCustomer: () => 1 })
    const adapter = new RazorpayAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, call(adapter), k, MAX))
    const customerPages = sent.filter((s) => s.path === '/customers')
    expect(customerPages.map((s) => s.params)).toEqual([
      { count: MAX, skip: 0 },
      { count: MAX, skip: MAX },
      { count: MAX, skip: 2 * MAX },
    ])
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(tokenIds)
    expect(new Set(all).size).toBe(250)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('never asks for more than 100 customers, and serves every token at a limit of 1000', async () => {
    const { sent, tokenIds } = fakeRazorpay(150, {
      tokensPerCustomer: (i) => (i % 3 === 0 ? 2 : 0),
    })
    const adapter = new RazorpayAdapter()
    const p1 = await callPage(adapter, call(adapter), 1, 1000)
    expect(sent.every((s) => s.params.count === undefined || Number(s.params.count) <= MAX)).toBe(
      true,
    )
    expect(p1.ids).toEqual(tokenIds)
    expect(p1.hasMore).toBe(false)
  })

  it('keys the row pager per connection: page 2 on another key is that key’s rows', async () => {
    const L = 3
    const { sent, tokenIds } = fakeRazorpay(6, { tokensPerCustomer: () => 1, tokensByAuth: true })
    const adapter = new RazorpayAdapter()
    const A: Credentials = { accessToken: 'a2V5X0E6c2VjcmV0X0E=' }
    const B: Credentials = { accessToken: 'a2V5X0I6c2VjcmV0X0I=' }
    const as = (creds: Credentials) => (params: QueryParams) =>
      adapter.listPaymentMethods(creds, params)
    const pA = await callPage(adapter, as(A), 1, L)
    expect(pA.ids).toEqual(tokenIds.slice(0, L).map((id) => `Basic ${A.accessToken}|${id}`))
    sent.length = 0
    const pB = await callPage(adapter, as(B), 2, L)
    // B's page 2 is fetched under B's key, never served from A's reuse slot.
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((s) => s.auth === `Basic ${B.accessToken}`)).toBe(true)
    expect(pB.ids).toEqual(tokenIds.slice(L, 2 * L).map((id) => `Basic ${B.accessToken}|${id}`))
  })

  it('skips a customer the listing returns without an id and keeps walking', async () => {
    // Customer 2 (index 1) has no id; the tokens of the customers after it must still be served.
    const { sent, tokenIds } = fakeRazorpay(4, {
      tokensPerCustomer: () => 1,
      noIdAt: (i) => i === 1,
    })
    expect(tokenIds).toHaveLength(3)
    const adapter = new RazorpayAdapter()
    const p1 = await callPage(adapter, call(adapter), 1, 10)
    expect(p1.ids).toEqual(tokenIds)
    expect(p1.hasMore).toBe(false)
    expect(sent.some((s) => s.path === '/customers/undefined/tokens')).toBe(false)
  })

  it('throws after 20 customer pages on a sparse account instead of fanning out', async () => {
    // 2,101 customers with one token, on the last: reaching it takes 22 customer pages.
    const n = 21 * MAX + 1
    const { sent } = fakeRazorpay(n, { tokensPerCustomer: (i) => (i === n - 1 ? 1 : 0) })
    const adapter = new RazorpayAdapter()
    await expect(callPage(adapter, call(adapter), 1, 10)).rejects.toThrow(/more than 20 upstream/)
    expect(sent.filter((s) => s.path === '/customers')).toHaveLength(20)
  })

  it('pages one customer’s whole token list locally when customer_id is given', async () => {
    const { sent, tokenIds } = fakeRazorpay(3, { tokensPerCustomer: (i) => (i === 1 ? 5 : 0) })
    const adapter = new RazorpayAdapter()
    const byCustomer = (params: QueryParams) =>
      adapter.listPaymentMethods(CREDS, Object.assign(params, { customer_id: 'cust_0002' }))
    const p1 = await callPage(adapter, byCustomer, 1, 2)
    const p2 = await callPage(adapter, byCustomer, 2, 2)
    const p3 = await callPage(adapter, byCustomer, 3, 2)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(tokenIds)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect(readUpstreamPage(p1.params)?.totalCount).toBe(5)
    expect(sent.every((s) => s.path === '/customers/cust_0002/tokens')).toBe(true)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    const { tokenIds } = fakeRazorpay(5, { tokensPerCustomer: () => 1 })
    const adapter = new RazorpayAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items = await adapter.listPaymentMethods(CREDS, params)
      return listPage(items, params, 'razorpay')
    }
    const r1 = await run(1)
    expect(r1.data.map((r) => r.id)).toEqual(tokenIds.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data.map((r) => r.id)).toEqual(tokenIds.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Razorpay listInvoiceLineItems paging (embedded, returned whole)', () => {
  it('slices the invoice’s whole line_items into the caller’s pages', async () => {
    const L = 3
    fakeRazorpay(0, { lineItems: 2 * L + 1 })
    const adapter = new RazorpayAdapter()
    const call = (params: QueryParams) => adapter.listInvoiceLineItems(CREDS, 'inv_1', params)
    const p1 = await callPage(adapter, call, 1, L)
    const p2 = await callPage(adapter, call, 2, L)
    const p3 = await callPage(adapter, call, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds('li', 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect(readUpstreamPage(p1.params)?.totalCount).toBe(2 * L + 1)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeRazorpay(0, { lineItems: 5 })
    const adapter = new RazorpayAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items = await adapter.listInvoiceLineItems(CREDS, 'inv_1', params)
      return listPage(items, params, 'razorpay')
    }
    const r1 = await run(1)
    expect(r1.data.map((r) => r.id)).toEqual(['li_0001', 'li_0002'])
    expect(r1.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data.map((r) => r.id)).toEqual(['li_0005'])
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Razorpay listPayouts filters', () => {
  it('passes account_id through as account_number, alongside count/skip', async () => {
    const { sent } = fakeRazorpay(5)
    const adapter = new RazorpayAdapter()
    await adapter.listPayouts(
      CREDS,
      withPageSink({ page: 2, limit: 2, account_id: '7878780080316316' }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe('/payouts')
    expect(sent[0]!.params).toMatchObject({ account_number: '7878780080316316', count: 2, skip: 2 })
  })

  it('sends no account_number when account_id is absent', async () => {
    const { sent } = fakeRazorpay(5)
    const adapter = new RazorpayAdapter()
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.params.account_number).toBeUndefined()
  })
})

describe('Razorpay page maximum', () => {
  it('declares maxPageSize 100, so the router clamps before the adapter sees it', () => {
    const adapter = new RazorpayAdapter()
    expect(adapter.capabilities.maxPageSize).toBe(MAX)
    const params = parseListQuery({ limit: '500' }, adapter as PageMaxBearing)
    expect(params.limit).toBe(MAX)
  })

  it('never sends a count above 100 on a direct call with no limit', async () => {
    const { sent } = fakeRazorpay(3)
    const adapter = new RazorpayAdapter()
    await adapter.listCharges(CREDS, {})
    expect(sent[0]!.params).toMatchObject({ skip: 0 })
    expect(Number(sent[0]!.params.count)).toBeLessThanOrEqual(MAX)
  })
})
