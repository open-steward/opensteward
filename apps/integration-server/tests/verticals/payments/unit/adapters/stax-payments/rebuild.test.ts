/**
 * Stax Payments: the list and get methods rebuilt onto documented endpoints.
 *
 *   listCustomers     GET /customer (find-all-customers): no paging parameter
 *                     documented, paginator response; follows next_page_url.
 *   listCharges       GET /transaction?type=charge  ("Filter by transaction
 *   listRefunds       GET /transaction?type=refund   type (e.g., charge, refund, void)."),
 *                     page + per_page ("min: 1, max: 200").
 *   listSubscriptions GET /invoice/schedule: "Paginate results using the
 *                     `page` and `limit` parameters."
 *   listDisputes      GET /underwriting/disputes: "Each page returns up to 10 results."
 *   listPayouts       GET /query/deposit: startDate and endDate required.
 *   listPlans         no plan resource: 501.
 *
 * The fake answers only documented paths and refuses any undocumented query
 * parameter.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { StaxPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/stax-payments/index'
import { ChargeSchema, type Charge } from '../../../../../../src/verticals/payments/schema/charge'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { RefundSchema, type Refund } from '../../../../../../src/verticals/payments/schema/refund'
import { SubscriptionSchema } from '../../../../../../src/verticals/payments/schema/subscription'
import { DisputeSchema } from '../../../../../../src/verticals/payments/schema/dispute'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { InvoiceSchema } from '../../../../../../src/verticals/payments/schema/invoice'

const CREDS = { accessToken: 'stax_key_a' }
const BASE = 'https://apiprod.fattlabs.com'
/** GET /self: "currency": ["USD"] (get-self-and-teams-info). */
const SELF = { merchant: { id: 'dd36b936-1eb7-4ece-bebc-b514c6a36ebd', currency: ['USD'] } }

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

type Handler = (path: string, params: Record<string, unknown>) => unknown

function fake(handler: Handler): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    reqs.push({ path: p, params: params ? { ...params } : undefined })
    if (p === '/self') {
      if (params && Object.keys(params).length > 0) throw new Error('/self takes no parameters')
      return { data: SELF }
    }
    return { data: handler(p, params ?? {}) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { reqs }
}

function only(params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented query parameter ${k}`)
  }
}

function envelope<R>(path: string, all: R[], page: number, perPage: number) {
  const lastPage = Math.max(1, Math.ceil(all.length / perPage))
  const from = (page - 1) * perPage
  return {
    total: all.length,
    per_page: perPage,
    current_page: page,
    last_page: lastPage,
    next_page_url: page < lastPage ? `${BASE}${path}?page=${page + 1}` : null,
    prev_page_url: page > 1 ? `${BASE}${path}?page=${page - 1}` : null,
    data: all.slice(from, from + perPage),
  }
}

function seq(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`)
}

async function walk<T extends { id: string }>(
  fn: (p: QueryParams) => Promise<T[]>,
  L: number,
  pages: number,
  extra: Partial<QueryParams> = {},
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; rows: T[] }> {
  const ids: string[] = []
  const rows: T[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit: L } as QueryParams)
    const got = await fn(params)
    rows.push(...got)
    ids.push(...got.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, rows }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Customers ────────────────────────────────────────────────────────────────

describe('listCustomers (GET /customer, following next_page_url)', () => {
  /** The server's own page size: uneven against the caller's limit. */
  const SERVER_PAGE = 3

  function customers(all: string[]): { reqs: Req[] } {
    return fake((p, params) => {
      let page: number
      if (p === '/customer') page = 1
      else {
        const m = /^https:\/\/apiprod\.fattlabs\.com\/customer\?page=(\d+)$/.exec(p)
        if (!m) throw new Error(`unexpected path ${p}`)
        page = Number(m[1])
      }
      only(params, [])
      const rows = all.map((id) => ({
        id,
        firstname: 'John',
        lastname: 'Smith',
        email: 'john@abc.com',
      }))
      return envelope('/customer', rows, page, SERVER_PAGE)
    })
  }

  it('serves N = 2L+1 rows once each with exact hasMore over uneven upstream pages', async () => {
    const L = 4
    const all = seq('cus', 2 * L + 1)
    const { reqs } = customers(all)
    const adapter = new StaxPaymentsAdapter()
    const { ids, hasMore, rows } = await walk((p) => adapter.listCustomers(CREDS, p), L, 3)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) CustomerSchema.parse(r)
    expect(reqs[0]).toEqual({ path: '/customer', params: undefined })
    expect(reqs.slice(1).every((r) => r.path.startsWith(`${BASE}/customer?page=`))).toBe(true)
  })

  it('refuses to follow a next_page_url off the documented host and path', async () => {
    fake(() => ({ data: [{ id: 'a' }], next_page_url: 'https://evil.example/customer?page=2' }))
    await expect(
      new StaxPaymentsAdapter().listCustomers(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toThrow(/refusing to follow/)
  })

  it('getCustomer reads the top-level object from GET /customer/{id}', async () => {
    const { reqs } = fake((p) => {
      if (p !== '/customer/d45ee88c-8b27-4be8-8d81-77dda1b81826') throw new Error(`unexpected ${p}`)
      return {
        id: 'd45ee88c-8b27-4be8-8d81-77dda1b81826',
        firstname: 'John',
        lastname: 'Smith',
        created_at: '2017-05-08 19:22:51',
      }
    })
    const c = CustomerSchema.parse(
      await new StaxPaymentsAdapter().getCustomer(CREDS, 'd45ee88c-8b27-4be8-8d81-77dda1b81826'),
    )
    expect(c.name).toBe('John Smith')
    expect(reqs).toHaveLength(1)
  })
})

// ── Charges and refunds ──────────────────────────────────────────────────────

describe.each([
  ['listCharges', 'charge'],
  ['listRefunds', 'refund'],
] as const)('%s (GET /transaction?type=%s)', (method, type) => {
  function transactions(all: string[], currency: string | null = 'USD'): { reqs: Req[] } {
    return fake((p, params) => {
      if (p !== '/transaction') throw new Error(`unexpected path ${p}`)
      only(params, ['type', 'page', 'per_page'])
      if (params.type !== type) throw new Error(`wrong type ${String(params.type)}`)
      const perPage = Number(params.per_page ?? 20)
      if (perPage < 1 || perPage > 200) throw new Error(`per_page ${perPage} outside 1..200`)
      const rows = all.map((id) => ({
        id,
        type,
        reference_id: type === 'refund' ? 'parent-charge' : '',
        total: 2.5,
        currency,
        status: 'SUCCESS',
        created_at: '2025-05-21 20:26:06',
      }))
      return envelope('/transaction', rows, Number(params.page ?? 1), perPage)
    })
  }

  it('walks N = 2L+1 rows with page + per_page and exact hasMore', async () => {
    const L = 5
    const all = seq(type, 2 * L + 1)
    const { reqs } = transactions(all)
    const adapter = new StaxPaymentsAdapter()
    const call = (p: QueryParams): Promise<Array<Charge | Refund>> =>
      method === 'listCharges' ? adapter.listCharges(CREDS, p) : adapter.listRefunds(CREDS, p)
    const { ids, hasMore, rows } = await walk(call, L, 3)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    expect(reqs.map((r) => r.params)).toEqual(
      [1, 2, 3].map((page) => ({ type, page, per_page: L })),
    )
    for (const r of rows) {
      if (method === 'listCharges') ChargeSchema.parse(r)
      else RefundSchema.parse(r)
      expect(r.amount).toBe(250)
      expect(r.currency).toBe('USD')
    }
    if (method === 'listRefunds') expect((rows[0] as Refund).chargeId).toBe('parent-charge')
  })

  it('clamps per_page to the documented 200 and reports that page size', async () => {
    const { reqs } = transactions(seq(type, 450))
    const params = withPageSink({ page: 2, limit: 500 } as QueryParams)
    const rows = await new StaxPaymentsAdapter()[method](CREDS, params)
    expect(rows).toHaveLength(200)
    expect(reqs[0]!.params).toEqual({ type, page: 2, per_page: 200 })
    expect(readUpstreamPage(params)?.pageSize).toBe(200)
    expect(readUpstreamPage(params)?.totalCount).toBe(450)
  })

  it('uses the merchant currency from GET /self, once, when a transaction currency is null', async () => {
    const { reqs } = transactions(seq(type, 3), null)
    const rows = await new StaxPaymentsAdapter()[method](
      CREDS,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(rows.map((r) => r.currency)).toEqual(['USD', 'USD', 'USD'])
    expect(reqs.filter((r) => r.path === '/self')).toHaveLength(1)
  })

  it('does not call GET /self when every transaction carries its currency', async () => {
    const { reqs } = transactions(seq(type, 3), 'USD')
    await new StaxPaymentsAdapter()[method](
      CREDS,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(reqs.some((r) => r.path === '/self')).toBe(false)
  })
})

describe('getCharge (GET /transaction/{id})', () => {
  it('reads the top-level transaction object', async () => {
    fake((p) => {
      if (p !== '/transaction/6f49149d') throw new Error(`unexpected ${p}`)
      return { id: '6f49149d', type: 'charge', total: 1, currency: 'USD', status: 'SUCCESS' }
    })
    const c = ChargeSchema.parse(await new StaxPaymentsAdapter().getCharge(CREDS, '6f49149d'))
    expect(c.amount).toBe(100)
    expect(c.status).toBe('succeeded')
  })
})

// ── Invoices ─────────────────────────────────────────────────────────────────

describe('getInvoice (GET /invoice/{id})', () => {
  it('reads the top-level invoice object in the merchant currency', async () => {
    fake((p) => {
      if (p !== '/invoice/e40bd293') throw new Error(`unexpected ${p}`)
      return { id: 'e40bd293', status: 'PAID', total: 1, paid_at: '2025-06-25 18:08:27' }
    })
    const inv = InvoiceSchema.parse(await new StaxPaymentsAdapter().getInvoice(CREDS, 'e40bd293'))
    expect(inv.total).toBe(100)
    expect(inv.currency).toBe('USD')
    expect(inv.status).toBe('paid')
  })

  it('refuses a merchant whose currency is not a single code', async () => {
    const get = vi.fn(async (p: string) => {
      if (p === '/self') return { data: { merchant: { currency: ['USD', 'CAD'] } } }
      return { data: { id: 'x', total: 1 } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    await expect(new StaxPaymentsAdapter().getInvoice(CREDS, 'x')).rejects.toThrow(
      /not a single code/,
    )
  })
})

// ── Subscriptions ────────────────────────────────────────────────────────────

describe('listSubscriptions (GET /invoice/schedule)', () => {
  it('walks N = 2L+1 rows with page + limit and exact hasMore', async () => {
    const L = 3
    const all = seq('sch', 2 * L + 1)
    const { reqs } = fake((p, params) => {
      if (p !== '/invoice/schedule') throw new Error(`unexpected path ${p}`)
      only(params, ['page', 'limit'])
      const rows = all.map((id) => ({ id, customer_id: 'cus-1', active: true }))
      return envelope(p, rows, Number(params.page ?? 1), Number(params.limit ?? 25))
    })
    const adapter = new StaxPaymentsAdapter()
    const { ids, hasMore, rows } = await walk((p) => adapter.listSubscriptions(CREDS, p), L, 3)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    expect(reqs.map((r) => r.params)).toEqual([1, 2, 3].map((page) => ({ page, limit: L })))
    for (const r of rows) SubscriptionSchema.parse(r)
  })
})

// ── Disputes ─────────────────────────────────────────────────────────────────

describe('listDisputes (GET /underwriting/disputes, 10 per page)', () => {
  function disputes(all: string[]): { reqs: Req[] } {
    return fake((p, params) => {
      if (p !== '/underwriting/disputes') throw new Error(`unexpected path ${p}`)
      only(params, ['page', 'id'])
      const rows = all.map((id) => ({
        id,
        transaction_id: `txn-${id}`,
        reason: 'FRAUD',
        amount: 10.5,
        status: 'PENDING',
        created_at: '2020-01-08T23:48:03.000Z',
      }))
      if (params.id !== undefined)
        return envelope(
          p,
          rows.filter((r) => r.id === params.id),
          1,
          10,
        )
      return envelope(p, rows, Number(params.page ?? 1), 10)
    })
  }

  it('cuts N = 2L+1 rows out of fixed 10-row pages, every id once, exact hasMore', async () => {
    const L = 7
    const all = seq('dp', 2 * L + 1)
    const { reqs } = disputes(all)
    const adapter = new StaxPaymentsAdapter()
    const { ids, hasMore, rows } = await walk((p) => adapter.listDisputes(CREDS, p), L, 3)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) {
      DisputeSchema.parse(r)
      expect(r.amount).toBe(1050)
      expect(r.currency).toBe('USD')
    }
    const pages = reqs.filter((r) => r.path === '/underwriting/disputes').map((r) => r.params)
    expect(pages).toEqual([{ page: 1 }, { page: 2 }])
  })

  it('reports hasMore false when the collection ends exactly on a caller page', async () => {
    disputes(seq('dp', 10))
    const adapter = new StaxPaymentsAdapter()
    const { hasMore } = await walk((p) => adapter.listDisputes(CREDS, p), 5, 2)
    expect(hasMore).toEqual([true, false])
  })

  it('getDispute reads one dispute through the documented id filter', async () => {
    const { reqs } = disputes(seq('dp', 12))
    const d = DisputeSchema.parse(await new StaxPaymentsAdapter().getDispute(CREDS, 'dp-0011'))
    expect(d.chargeId).toBe('txn-dp-0011')
    expect(reqs[0]).toEqual({ path: '/underwriting/disputes', params: { id: 'dp-0011' } })
  })

  it('getDispute returns only the row whose id matches, even if the filter is ignored', async () => {
    // An upstream that ignored the id filter would answer with a full page.
    fake((p) => {
      if (p !== '/underwriting/disputes') throw new Error(`unexpected path ${p}`)
      const rows = ['dp-0001', 'dp-0002', 'dp-0003'].map((id) => ({
        id,
        transaction_id: `txn-${id}`,
        reason: 'FRAUD',
        amount: 10.5,
        status: 'PENDING',
        created_at: '2020-01-08T23:48:03.000Z',
      }))
      return envelope(p, rows, 1, 10)
    })
    const d = DisputeSchema.parse(await new StaxPaymentsAdapter().getDispute(CREDS, 'dp-0003'))
    expect(d.id).toBe('dp-0003')
    expect(d.chargeId).toBe('txn-dp-0003')
    await expect(new StaxPaymentsAdapter().getDispute(CREDS, 'dp-9999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getDispute answers 404 when the filter returns nothing', async () => {
    disputes([])
    await expect(new StaxPaymentsAdapter().getDispute(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Payouts ──────────────────────────────────────────────────────────────────

describe('listPayouts (GET /query/deposit, date windows)', () => {
  const DAY = 86_400_000

  function ymd(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Deposits per UTC day: newest first, uneven per day. */
  const BY_DAY: Record<string, string[]> = {
    '2026-03-10': ['b10a'],
    '2026-03-09': [],
    '2026-03-08': ['b08a', 'b08b', 'b08c'],
    '2026-03-07': ['b07a'],
  }

  function deposits(): { reqs: Req[] } {
    return fake((p, params) => {
      if (p !== '/query/deposit') throw new Error(`unexpected path ${p}`)
      only(params, ['startDate', 'endDate'])
      const s = String(params.startDate)
      const e = String(params.endDate)
      const m = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/.exec(s)
      if (!m || e !== `${m[1]} 23:59:59`) throw new Error(`bad window ${s}..${e}`)
      return {
        data: (BY_DAY[m[1]!] ?? []).map((batch_id) => ({
          batch_id,
          batched_at: m[1],
          sum: 1.25,
          count: 1,
        })),
      }
    })
  }

  it('refuses an unfiltered call with 501 and sends no request', async () => {
    const { reqs } = deposits()
    await expect(
      new StaxPaymentsAdapter().listPayouts(
        CREDS,
        withPageSink({ page: 1, limit: 10 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(reqs).toHaveLength(0)
  })

  it('walks UTC day windows newest first back to updatedAfter, every id once, exact hasMore', async () => {
    const { reqs } = deposits()
    const adapter = new StaxPaymentsAdapter()
    const updatedAfter = new Date('2026-03-07T15:30:00Z')
    const L = 2
    const { ids, hasMore, rows } = await walk((p) => adapter.listPayouts(CREDS, p), L, 3, {
      updatedAfter,
    })
    expect(ids).toEqual(['b10a', 'b08a', 'b08b', 'b08c', 'b07a'])
    expect(hasMore).toEqual([true, true, false])
    for (const r of rows) {
      PayoutSchema.parse(r)
      expect(r.amount).toBe(125)
      expect(r.currency).toBe('USD')
    }
    const windows = reqs.filter((r) => r.path === '/query/deposit').map((r) => r.params?.startDate)
    expect(windows).toEqual([10, 9, 8, 7].map((d) => `${ymd(Date.UTC(2026, 2, d))} 00:00:00`))
    expect(
      windows.every((w) => new Date(`${String(w).slice(0, 10)}T00:00:00Z`).getTime() % DAY === 0),
    ).toBe(true)
  })
})

// ── Refusals ─────────────────────────────────────────────────────────────────

describe('methods with no documented endpoint refuse before any request', () => {
  it.each([
    ['listPlans', (a: StaxPaymentsAdapter) => a.listPlans(CREDS, {} as QueryParams)],
    ['getPlan', (a: StaxPaymentsAdapter) => a.getPlan(CREDS, 'x')],
    ['getSubscription', (a: StaxPaymentsAdapter) => a.getSubscription(CREDS, 'x')],
    ['getPayout', (a: StaxPaymentsAdapter) => a.getPayout(CREDS, 'x')],
  ] as const)('%s throws 501 NOT_SUPPORTED', async (_name, call) => {
    const { reqs } = fake(() => {
      throw new Error('no request expected')
    })
    await expect(call(new StaxPaymentsAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(reqs).toHaveLength(0)
  })
})
