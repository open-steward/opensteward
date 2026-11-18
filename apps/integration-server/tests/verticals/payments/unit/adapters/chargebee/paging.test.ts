/**
 * Chargebee list paging: 1-based `page` + caller's `limit` → Chargebee
 * `limit` + `offset` (an opaque cursor), ending when `next_offset` is absent.
 *
 * Every list endpoint the adapter reads (customers, subscriptions, invoices,
 * transactions, payment_sources, plans) documents the same parameters, e.g.
 * https://apidocs.chargebee.com/docs/api/customers/list-customers:
 *
 *   offset:      "Determines your position in the list for pagination. To
 *                 ensure that the next page is retrieved correctly, always set
 *                 offset to the value of next_offset obtained in the previous
 *                 iteration of the API call."
 *   limit:       "optional, integer, default=10, min=1, max=100"
 *   next_offset: "This attribute is returned only if more resources are
 *                 present. To fetch the next set of resources use this value
 *                 for the input parameter offset."
 *
 * Transactions also document the `type` filter (`type[is]=refund`), which
 * listRefunds sends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { ChargebeeAdapter } from '../../../../../../src/verticals/payments/adapters/chargebee/index'

const MAX = 100

const CREDS: Credentials = {
  accessToken: Buffer.from('test_key:').toString('base64'),
  extra: { site: 'acme-test' },
}

type Method =
  | 'listCustomers'
  | 'listSubscriptions'
  | 'listInvoices'
  | 'listCharges'
  | 'listRefunds'
  | 'listPaymentMethods'
  | 'listPlans'

interface Case {
  method: Method
  path: string
  /** The wrapper key of each `list` entry. */
  wrap: string
  /** The ids a correct walk must return, given the fake's data. */
  expected: (data: FakeData) => string[]
}

interface Row {
  id: string
  type?: string
}

type FakeData = Record<string, Row[]>

const CASES: Case[] = [
  {
    method: 'listCustomers',
    path: '/customers',
    wrap: 'customer',
    expected: (d) => ids(d['/customers']),
  },
  {
    method: 'listSubscriptions',
    path: '/subscriptions',
    wrap: 'subscription',
    expected: (d) => ids(d['/subscriptions']),
  },
  {
    method: 'listInvoices',
    path: '/invoices',
    wrap: 'invoice',
    expected: (d) => ids(d['/invoices']),
  },
  {
    method: 'listCharges',
    path: '/transactions',
    wrap: 'transaction',
    expected: (d) => ids(d['/transactions']),
  },
  {
    method: 'listRefunds',
    path: '/transactions',
    wrap: 'transaction',
    expected: (d) => ids(d['/transactions']!.filter((r) => r.type === 'refund')),
  },
  {
    method: 'listPaymentMethods',
    path: '/payment_sources',
    wrap: 'payment_source',
    expected: (d) => ids(d['/payment_sources']),
  },
  { method: 'listPlans', path: '/plans', wrap: 'plan', expected: (d) => ids(d['/plans']) },
]

function ids(rows: Row[] | undefined): string[] {
  return (rows ?? []).map((r) => r.id)
}

interface Sent {
  path: string
  params: Record<string, unknown>
}

const WRAP: Record<string, string> = {
  '/customers': 'customer',
  '/subscriptions': 'subscription',
  '/invoices': 'invoice',
  '/transactions': 'transaction',
  '/payment_sources': 'payment_source',
  '/plans': 'plan',
}

/**
 * Build a dataset where the collection behind `method` has exactly `n` rows
 * that method returns. Transactions mix refunds and payments: for listRefunds
 * there are `n` refunds with payments interleaved (which the `type[is]`
 * filter must drop); otherwise there are `n` transactions in all.
 */
function dataset(n: number, method?: Method): FakeData {
  const plain = (prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}_${String(i + 1).padStart(4, '0')}` }))
  const txns: Row[] = []
  if (method === 'listRefunds') {
    for (let i = 0; i < n; i++) {
      txns.push({ id: `txn_r${String(i + 1).padStart(4, '0')}`, type: 'refund' })
      if (i % 2 === 0) txns.push({ id: `txn_p${String(i + 1).padStart(4, '0')}`, type: 'payment' })
    }
  } else {
    for (let i = 0; i < n; i++) {
      const type = i % 3 === 2 ? 'refund' : 'payment'
      txns.push({ id: `txn_${String(i + 1).padStart(4, '0')}`, type })
    }
  }
  return {
    '/customers': plain('cus'),
    '/subscriptions': plain('sub'),
    '/invoices': plain('inv'),
    '/transactions': txns,
    '/payment_sources': plain('pm'),
    '/plans': plain('plan'),
  }
}

/**
 * A fake Chargebee that honours ONLY the documented parameters: `limit`
 * (default 10, 1..100, 400 outside), `offset` (an opaque string that must be
 * a `next_offset` it minted) and, on /transactions, `type[is]`. The response
 * carries `next_offset` only when more resources are present.
 */
function fakeChargebee(data: FakeData) {
  const sent: Sent[] = []
  const minted = new Map<string, number>()
  const issued: string[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    sent.push({ path, params })
    let rows = data[path]
    if (!rows) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    if (path === '/transactions' && params['type[is]'] !== undefined) {
      rows = rows.filter((r) => r.type === params['type[is]'])
    }
    const limit = params.limit === undefined ? 10 : Number(params.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      throw Object.assign(new Error(`400 limit ${String(params.limit)}`), {
        response: { status: 400 },
      })
    }
    let start = 0
    if (params.offset !== undefined) {
      const at = minted.get(String(params.offset))
      if (at === undefined) {
        throw Object.assign(new Error('400 offset'), { response: { status: 400 } })
      }
      start = at
    }
    const slice = rows.slice(start, start + limit)
    const body: Record<string, unknown> = {
      // Amounts in minor units, as Chargebee sends them; the transforms require them.
      list: slice.map((r) => ({
        [WRAP[path]!]: { ...r, amount: 1000, total: 1000, currency_code: 'USD' },
      })),
    }
    const end = start + slice.length
    if (end < rows.length) {
      const token = JSON.stringify([String(1_700_000_000 + end), rows[end - 1]!.id])
      minted.set(token, end)
      issued.push(token)
      body.next_offset = token
    }
    return { data: body }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { sent, issued }
}

async function callPage(
  adapter: ChargebeeAdapter,
  method: Method,
  page: number,
  limit: number,
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ page, limit })
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Chargebee $method paging', ({ method, path, expected }) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    const data = dataset(2 * L + 1, method)
    fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(expected(data))
    const p4 = await callPage(adapter, method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('sends page 2 as offset=<next_offset of page 1> at the caller page size', async () => {
    const L = 4
    const { sent, issued } = fakeChargebee(dataset(10, method))
    const adapter = new ChargebeeAdapter()
    await callPage(adapter, method, 1, L)
    expect(sent[0]!.params.offset).toBeUndefined()
    const page1Next = issued[issued.length - 1]
    expect(page1Next).toBeDefined()
    sent.length = 0
    await callPage(adapter, method, 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(path)
    expect(sent[0]!.params).toMatchObject({ limit: L, offset: page1Next })
    if (method === 'listRefunds') expect(sent[0]!.params['type[is]']).toBe('refund')
  })

  it('walks the cursor chain for a page asked for out of order', async () => {
    const data = dataset(9, method)
    fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    const p3 = await callPage(adapter, method, 3, 3)
    expect(p3.ids).toEqual(expected(data).slice(6, 9))
    expect(p3.hasMore).toBe(expected(data).length > 9)
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const data = dataset(2 * MAX + 1, method)
    const { sent } = fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    const all = expected(data)
    const pages = []
    for (let k = 1; k <= Math.ceil(all.length / MAX) + 1; k++) {
      pages.push(await callPage(adapter, method, k, 1000))
    }
    expect(sent.every((s) => s.params.limit === MAX)).toBe(true)
    expect(pages.flatMap((p) => p.ids)).toEqual(all)
    expect(pages.map((p) => p.hasMore)).toEqual(pages.map((_, i) => i < pages.length - 2))
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
  })

  it('keeps each connection on its own walk', async () => {
    const { sent } = fakeChargebee(dataset(9, method))
    const adapter = new ChargebeeAdapter()
    await callPage(adapter, method, 1, 3)
    sent.length = 0
    const other: Credentials = {
      accessToken: Buffer.from('other_key:').toString('base64'),
      extra: { site: 'acme-test' },
    }
    await callPage(adapter, method, 2, 3, other)
    expect(sent.map((s) => s.params.offset)).toEqual([undefined, expect.any(String)])
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    const data = dataset(5, method)
    fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    const total = expected(data).length
    const lastPage = Math.ceil(total / 2)
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'chargebee')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const rLast = await run(lastPage)
    expect(rLast.data).toHaveLength(total - 2 * (lastPage - 1))
    expect(rLast.meta.hasMore).toBe(false)
  })
})

describe('Chargebee pager keys and ceiling', () => {
  it('keeps charges and refunds on separate walks over /transactions', async () => {
    const data = dataset(9, 'listRefunds')
    const { sent } = fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    await callPage(adapter, 'listCharges', 1, 3)
    sent.length = 0
    const r2 = await callPage(adapter, 'listRefunds', 2, 3)
    // The refunds walk starts from its own first page: no charges cursor.
    expect(sent[0]!.params.offset).toBeUndefined()
    expect(r2.ids).toEqual(
      ids(data['/transactions']!.filter((r) => r.type === 'refund')).slice(3, 6),
    )
  })

  it('keeps each page size on its own walk', async () => {
    const data = dataset(12)
    const { sent } = fakeChargebee(data)
    const adapter = new ChargebeeAdapter()
    await callPage(adapter, 'listCustomers', 1, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listCustomers', 2, 4)
    // A cursor minted at limit 3 must not position a limit-4 walk.
    expect(sent[0]!.params.offset).toBeUndefined()
    expect(p2.ids).toEqual(ids(data['/customers']).slice(4, 8))
  })

  it('keeps each site on its own walk, even with the same API key', async () => {
    const { sent } = fakeChargebee(dataset(9))
    const adapter = new ChargebeeAdapter()
    await callPage(adapter, 'listCustomers', 1, 3)
    sent.length = 0
    const otherSite: Credentials = { ...CREDS, extra: { site: 'other-site' } }
    await callPage(adapter, 'listCustomers', 2, 3, otherSite)
    expect(sent.map((s) => s.params.offset)).toEqual([undefined, expect.any(String)])
  })

  it.each([
    [2.7, 2],
    [0, MAX],
    [-5, MAX],
  ])('sends a valid whole limit for a direct call with limit %s', async (asked, sentLimit) => {
    const { sent } = fakeChargebee(dataset(3))
    const adapter = new ChargebeeAdapter()
    await adapter.listCustomers(CREDS, { limit: asked })
    expect(sent[0]!.params.limit).toBe(sentLimit)
  })

  it('sends the previous default page size when a direct call passes no limit', async () => {
    const { sent } = fakeChargebee(dataset(3))
    const adapter = new ChargebeeAdapter()
    await adapter.listCustomers(CREDS, {})
    expect(sent[0]!.params.limit).toBe(MAX)
  })

  it('declares maxPageSize 100, the documented maximum of every list endpoint', () => {
    expect(new ChargebeeAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('the router clamps a caller limit to 100', () => {
    const params = parseListQuery({ limit: '500' }, new ChargebeeAdapter() as PageMaxBearing)
    expect(params.limit).toBe(MAX)
  })
})
