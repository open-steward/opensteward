/**
 * PayPal list methods, paged the way the router and the sync worker ask.
 *
 * Every PayPal list endpoint fixed here pages by a 1-based `page` plus
 * `page_size`, each with its own documented ceiling:
 *
 *   GET /v2/invoicing/invoices       page ≤ 1000, page_size ≤ 100, total_required
 *     "a combination of `page=2` and `page_size=20` returns the next 20 invoices"
 *     (https://developer.paypal.com/api/invoicing/v2/invoices-list)
 *   GET /v1/billing/plans            page_size ≤ 20, total_required
 *     (https://developer.paypal.com/api/subscriptions/v1/plans-list)
 *   GET /v1/customer/disputes        page ≤ 50, page_size ≤ 50, no totals; "includes a
 *     HATEOAS link to the next page of results"
 *     (https://developer.paypal.com/api/customer-disputes/v1/disputes-list)
 *   GET /v3/vault/payment-tokens     customer_id required, page ≤ 10, page_size ≤ 5,
 *     total_required
 *     (https://developer.paypal.com/api/payment-tokens/v3/customer-payment-tokens-get)
 *   GET /v1/reporting/transactions   start_date + end_date required, page_size ≤ 500
 *     (https://developer.paypal.com/api/transaction-search/v1/search-get)
 *
 * The adapter used to send `page_size` alone (or nothing, for disputes), so
 * page 2 was page 1 again. The fake below honours only the documented
 * parameters, refuses a size or page outside the documented range, and
 * returns totals only where (and when) the docs say it does.
 *
 * Invoice line items are embedded in GET /v2/invoicing/invoices/{id}, which
 * takes no paging parameters: the whole collection, sliced locally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PayPalAdapter } from '../../../../../../src/verticals/payments/adapters/paypal'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/paypal/client', () => ({
  PayPalClient: class {
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params)
    post = vi.fn()
  },
}))

const adapter = new PayPalAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'test_paging' }

type ListMethod =
  'listInvoices' | 'listPlans' | 'listDisputes' | 'listPaymentMethods' | 'listBalanceTransactions'

interface Endpoint {
  method: ListMethod
  path: string
  /** The response field holding the rows. */
  key: string
  maxSize: number
  maxPage: number
  defaultSize: number
  /** Documented query parameters beyond page / page_size. */
  allowed: string[]
  /** Required query parameters. */
  required: string[]
  /** `requested`: totals only with total_required=true; `always`; `none`. */
  totals: 'requested' | 'always' | 'none'
  /** Whether the response carries a HATEOAS `next` link. */
  links: boolean
  /** Wrap one id as a raw upstream row. */
  row: (id: string) => Record<string, unknown>
  /** Params the caller must pass for the method to list at all. */
  extra: Record<string, unknown>
  /** A limit the test pages at, below the ceiling. */
  L: number
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'listInvoices',
    path: '/v2/invoicing/invoices',
    key: 'items',
    maxSize: 100,
    maxPage: 1000,
    defaultSize: 20,
    allowed: ['total_required', 'fields'],
    required: [],
    totals: 'requested',
    links: false,
    row: (id) => ({ id, status: 'SENT' }),
    extra: {},
    L: 10,
  },
  {
    method: 'listPlans',
    path: '/v1/billing/plans',
    key: 'plans',
    maxSize: 20,
    maxPage: 10_000_000,
    defaultSize: 10,
    allowed: ['total_required', 'product_id', 'plan_ids'],
    required: [],
    totals: 'requested',
    links: false,
    row: (id) => ({ id, status: 'ACTIVE' }),
    extra: {},
    L: 7,
  },
  {
    method: 'listDisputes',
    path: '/v1/customer/disputes',
    key: 'items',
    maxSize: 50,
    maxPage: 50,
    defaultSize: 10,
    allowed: ['start_time', 'disputed_transaction_id', 'dispute_state', 'update_time_before'],
    required: [],
    totals: 'none',
    links: true,
    row: (id) => ({ dispute_id: id, status: 'OPEN' }),
    extra: {},
    L: 10,
  },
  {
    method: 'listPaymentMethods',
    path: '/v3/vault/payment-tokens',
    key: 'payment_tokens',
    maxSize: 5,
    maxPage: 10,
    defaultSize: 5,
    allowed: ['customer_id', 'total_required'],
    required: ['customer_id'],
    totals: 'requested',
    links: false,
    row: (id) => ({ id, customer: { id: 'cust_1' } }),
    extra: { customerId: 'cust_1' },
    L: 2,
  },
  {
    method: 'listBalanceTransactions',
    path: '/v1/reporting/transactions',
    key: 'transaction_details',
    maxSize: 500,
    maxPage: Number.MAX_SAFE_INTEGER,
    defaultSize: 100,
    allowed: ['start_date', 'end_date', 'transaction_id', 'fields'],
    required: ['start_date', 'end_date'],
    totals: 'always',
    links: true,
    row: (id) => ({ transaction_info: { transaction_id: id } }),
    extra: {},
    L: 10,
  },
]

function rowIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

/**
 * Serve `ids` at the endpoint, honouring only its documented parameters.
 * Returns the params of every request, in order.
 */
function serve(ep: Endpoint, ids: string[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== ep.path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    for (const k of Object.keys(params)) {
      if (k !== 'page' && k !== 'page_size' && !ep.allowed.includes(k)) {
        throw new Error(`undocumented param ${k}`)
      }
    }
    for (const k of ep.required) {
      if (params[k] === undefined) throw new Error(`400 missing required ${k}`)
    }
    const size = params['page_size'] === undefined ? ep.defaultSize : Number(params['page_size'])
    if (!Number.isInteger(size) || size < 1 || size > ep.maxSize) {
      throw new Error(`400 invalid page_size: ${String(params['page_size'])}`)
    }
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    if (!Number.isInteger(page) || page < 1 || page > ep.maxPage) {
      throw new Error(`400 invalid page: ${String(params['page'])}`)
    }
    const start = (page - 1) * size
    const slice = ids.slice(start, start + size)
    const totalPages = Math.ceil(ids.length / size)
    const body: Record<string, unknown> = { [ep.key]: slice.map(ep.row) }
    const withTotals =
      ep.totals === 'always' ||
      (ep.totals === 'requested' && String(params['total_required']) === 'true')
    if (withTotals) {
      body['total_items'] = ids.length
      body['total_pages'] = totalPages
    }
    if (ep.links) {
      const links = [{ href: `${ep.path}?page=${page}&page_size=${size}`, rel: 'self' }]
      if (start + size < ids.length) {
        links.push({ href: `${ep.path}?page=${page + 1}&page_size=${size}`, rel: 'next' })
      }
      body['links'] = links
    }
    return body
  })
  return calls
}

async function call(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  const fn = adapter[method].bind(adapter) as (
    c: Credentials,
    p: QueryParams,
  ) => Promise<{ id: string }[]>
  return fn(CREDS, params)
}

function sinkParams(ep: Endpoint, page: number, limit: number): QueryParams {
  return withPageSink({ page, limit, ...ep.extra } as QueryParams)
}

beforeEach(() => {
  getMock.mockReset()
})

describe.each(ENDPOINTS.map((ep) => [ep.method, ep] as const))(
  'PayPalAdapter.%s paging',
  (_m, ep) => {
    const prefix = `${ep.method}_`

    it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
      const L = ep.L
      const all = rowIds(prefix, 2 * L + 1)
      const calls = serve(ep, all)
      const ids: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 3; page++) {
        const params = sinkParams(ep, page, L)
        const rows = await call(ep.method, params)
        ids.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(ids).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      expect(calls).toHaveLength(3)
      // The page-2 request carries the documented key.
      expect(calls[1]).toMatchObject({ page: 2, page_size: L })
      expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
    })

    it('reports the end on a full last page', async () => {
      const L = ep.L
      serve(ep, rowIds(prefix, 2 * L))
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 2; page++) {
        const params = sinkParams(ep, page, L)
        await call(ep.method, params)
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(hasMore).toEqual([true, false])
    })

    it(`clamps a limit above ${ep.maxSize} and still serves every row`, async () => {
      const N = 2 * ep.maxSize + 1
      const all = rowIds(prefix, N)
      const calls = serve(ep, all)
      const ids: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 3; page++) {
        const params = sinkParams(ep, page, ep.maxSize + 100)
        const rows = await call(ep.method, params)
        ids.push(...rows.map((r) => r.id))
        const report = readUpstreamPage(params)
        hasMore.push(report?.hasMore)
        expect(report?.pageSize).toBe(ep.maxSize)
      }
      expect(ids).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((c) => c['page_size'])).toEqual([ep.maxSize, ep.maxSize, ep.maxSize])
    })

    it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
      const L = ep.L
      const all = rowIds(prefix, 2 * L + 1)
      serve(ep, all)
      const metas = []
      const ids: string[] = []
      for (let page = 1; page <= 3; page++) {
        const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
        Object.assign(params, ep.extra)
        const rows = await call(ep.method, params)
        ids.push(...rows.map((r) => r.id))
        metas.push(listPage(rows, params, 'paypal').meta)
      }
      expect(ids).toEqual(all)
      expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    })

    if (ep.maxPage < Number.MAX_SAFE_INTEGER) {
      it(`refuses a page past the documented maximum of ${ep.maxPage} before sending`, async () => {
        const calls = serve(ep, rowIds(prefix, 3))
        await expect(call(ep.method, sinkParams(ep, ep.maxPage + 1, 1))).rejects.toMatchObject({
          statusCode: 400,
        })
        expect(calls).toHaveLength(0)
      })

      it(`still sends the last documented page, ${ep.maxPage}`, async () => {
        const calls = serve(ep, rowIds(prefix, 3))
        const params = sinkParams(ep, ep.maxPage, 1)
        await expect(call(ep.method, params)).resolves.toEqual([])
        expect(calls).toHaveLength(1)
        expect(calls[0]).toMatchObject({ page: ep.maxPage })
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    }
  },
)

describe.each(
  ENDPOINTS.filter((ep) => ep.totals === 'requested').map((ep) => [ep.method, ep] as const),
)('PayPalAdapter.%s without totals in the response', (_m, ep) => {
  it('falls back to the next link for hasMore', async () => {
    const hasMore: (boolean | undefined)[] = []
    for (const next of [true, false]) {
      getMock.mockImplementation(async (p: string) => {
        if (p !== ep.path) throw new Error(`unexpected path ${p}`)
        const links = [{ href: `${ep.path}?page=1`, rel: 'self' }]
        if (next) links.push({ href: `${ep.path}?page=2`, rel: 'next' })
        return { [ep.key]: [ep.row(`${ep.method}_x`)], links }
      })
      const params = sinkParams(ep, 1, 1)
      await call(ep.method, params)
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.totalCount).toBeUndefined()
    }
    expect(hasMore).toEqual([true, false])
  })
})

describe('PayPalAdapter.listPaymentMethods without a customer', () => {
  it('refuses before sending: customer_id is required upstream', async () => {
    const ep = ENDPOINTS.find((e) => e.method === 'listPaymentMethods')!
    const calls = serve(ep, rowIds('tok_', 3))
    await expect(
      call('listPaymentMethods', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })
})

describe('PayPalAdapter.listBalanceTransactions search window', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the default start_date fixed between page requests made at different times', async () => {
    const ep = ENDPOINTS.find((e) => e.method === 'listBalanceTransactions')!
    const calls = serve(ep, rowIds('txn_', 25))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T10:15:00Z'))
    await call('listBalanceTransactions', withPageSink({ page: 1, limit: 10 }))
    vi.setSystemTime(new Date('2026-09-23T10:16:30Z'))
    await call('listBalanceTransactions', withPageSink({ page: 2, limit: 10 }))
    expect(calls[0]!['start_date']).toBe(calls[1]!['start_date'])
    // Within the documented 31-day maximum range.
    const span =
      new Date(String(calls[1]!['end_date'])).getTime() -
      new Date(String(calls[1]!['start_date'])).getTime()
    expect(span).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000)
  })

  it('defaults start_date to UTC midnight 30 days before today', async () => {
    const ep = ENDPOINTS.find((e) => e.method === 'listBalanceTransactions')!
    const calls = serve(ep, rowIds('txn_', 3))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T10:15:00Z'))
    await call('listBalanceTransactions', withPageSink({ page: 1, limit: 10 }))
    expect(calls[0]!['start_date']).toBe('2026-08-24T00:00:00.000Z')
  })

  it('takes hasMore from total_pages on page 1 when the response has no links', async () => {
    const hasMore: (boolean | undefined)[] = []
    for (const totalPages of [3, 1]) {
      getMock.mockImplementation(async () => ({
        transaction_details: [{ transaction_info: { transaction_id: 'txn_1' } }],
        total_items: totalPages * 10,
        total_pages: totalPages,
      }))
      const params = withPageSink({ page: 1, limit: 10 })
      await call('listBalanceTransactions', params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('reports the total from page 1 only (total_items may be page-relative)', async () => {
    const ep = ENDPOINTS.find((e) => e.method === 'listBalanceTransactions')!
    serve(ep, rowIds('txn_', 25))
    const p1 = withPageSink({ page: 1, limit: 10 })
    await call('listBalanceTransactions', p1)
    expect(readUpstreamPage(p1)?.totalCount).toBe(25)
    const p2 = withPageSink({ page: 2, limit: 10 })
    await call('listBalanceTransactions', p2)
    expect(readUpstreamPage(p2)?.totalCount).toBeUndefined()
  })
})

describe('PayPalAdapter.listInvoiceLineItems', () => {
  const INVOICE = 'INV2-AAAA'
  function serveInvoice(ids: string[]): Record<string, unknown>[] {
    const calls: Record<string, unknown>[] = []
    getMock.mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== `/v2/invoicing/invoices/${INVOICE}`) throw new Error(`unexpected path ${p}`)
      // GET /v2/invoicing/invoices/{invoice_id} takes no query parameters.
      if (params && Object.keys(params).length > 0) throw new Error('undocumented params')
      calls.push({})
      return { id: INVOICE, items: ids.map((id) => ({ id, name: id, quantity: '1' })) }
    })
    return calls
  }

  it('slices the embedded items: 2L+1 rows across three pages, each once', async () => {
    const L = 4
    const all = rowIds('item_', 2 * L + 1)
    serveInvoice(all)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 4
    const all = rowIds('item_', 2 * L + 1)
    serveInvoice(all)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      metas.push(listPage(rows, params, 'paypal').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })
})
