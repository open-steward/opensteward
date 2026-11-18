/**
 * Payabli list methods, paged the way the router and sync worker ask.
 *
 * Every list is GET /Query/<resource>/{entry}, paged by `fromRecord` ("The
 * number of records to skip before starting to collect the result set.") and
 * `limitRecord` ("Max number of records to return for the query. Use `0` or
 * negative value to return all records."), answering `{ Records, Summary }`
 * with `Summary.totalRecords` across pages.
 * (https://docs.payabli.com/developers/api-reference/query/get-list-of-transactions-for-an-entrypoint.md
 *  and the customer, chargeback, invoice and subscription list pages.)
 *
 * The fake honours only documented parameters and rejects any other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_PAGE_LIMIT, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PayabliAdapter } from '../../../../../../src/verticals/payments/adapters/payabli'
import { PayabliClient } from '../../../../../../src/verticals/payments/adapters/payabli/client'
import {
  CHARGEBACKS_LIST,
  CUSTOMERS_LIST,
  INVOICES_LIST,
  SUBSCRIPTIONS_LIST,
  TRANSACTIONS_LIST,
} from './fixtures/documented'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/payabli/client', async (orig) => {
  const real =
    await orig<typeof import('../../../../../../src/verticals/payments/adapters/payabli/client')>()
  return {
    PayabliClient: class extends real.PayabliClient {
      override get = getMock as never
    },
  }
})

const adapter = new PayabliAdapter()
const ENTRY = '8cfec329267'
const CREDS: Credentials = { accessToken: 'tok', extra: { entry: ENTRY, currency: 'USD' } }
const NO_ENTRY: Credentials = { accessToken: 'tok', extra: { currency: 'USD' } }
const NO_CURRENCY: Credentials = { accessToken: 'tok', extra: { entry: ENTRY } }
const AFTER = new Date('2024-04-01T00:00:00Z')

const PAGING = ['fromRecord', 'limitRecord']
const DOCUMENTED: Record<string, Set<string>> = {
  transactions: new Set([...PAGING, 'transactionDate(ge)', 'operation(eq)']),
  customers: new Set(PAGING),
  chargebacks: new Set(PAGING),
  invoices: new Set(PAGING),
  subscriptions: new Set(PAGING),
}

type Resource = keyof typeof DOCUMENTED

const ROW: Record<
  Resource,
  { base: Record<string, unknown>; id: (n: number) => Record<string, unknown> }
> = {
  transactions: { base: TRANSACTIONS_LIST.Records[0], id: (n) => ({ PaymentTransId: `T${n}` }) },
  customers: { base: CUSTOMERS_LIST.Records[0], id: (n) => ({ customerId: n }) },
  chargebacks: { base: CHARGEBACKS_LIST.Records[0], id: (n) => ({ Id: n }) },
  invoices: { base: INVOICES_LIST.Records[0], id: (n) => ({ invoiceId: n }) },
  subscriptions: { base: SUBSCRIPTIONS_LIST.Records[0], id: (n) => ({ IdSub: n }) },
}

function serve(resource: Resource, n: number, withTotal = true) {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(async (p: string, q: Record<string, unknown>) => {
    expect(p).toBe(`/Query/${resource}/${ENTRY}`)
    for (const k of Object.keys(q))
      expect(DOCUMENTED[resource]!.has(k), `undocumented param ${k}`).toBe(true)
    calls.push(q)
    const from = q.fromRecord as number
    const size = q.limitRecord as number
    expect(Number.isInteger(from) && from >= 0).toBe(true)
    expect(Number.isInteger(size) && size >= 1).toBe(true)
    const count = Math.max(0, Math.min(size, n - from))
    const Records = Array.from({ length: count }, (_, i) => ({
      ...ROW[resource].base,
      ...ROW[resource].id(from + i + 1),
    }))
    return {
      Records,
      Summary: { pageSize: size, ...(withTotal ? { totalRecords: n } : {}) },
    }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
})

const CASES = [
  ['listCustomers', 'customers', {}],
  ['listDisputes', 'chargebacks', {}],
  ['listInvoices', 'invoices', {}],
  ['listSubscriptions', 'subscriptions', {}],
  ['listCharges', 'transactions', { updatedAfter: AFTER }],
] as const

describe.each(CASES)('%s', (method, resource, extra) => {
  const call = (params: QueryParams, creds: Credentials = CREDS) =>
    (adapter[method] as (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>).call(
      adapter,
      creds,
      params,
    )

  it('walks N = 2L + 1 rows, every id once, hasMore exact', async () => {
    const L = 3
    const N = 2 * L + 1
    const calls = serve(resource, N)
    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, ...extra })
      const rows = await call(params)
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      expect(meta?.totalCount).toBe(N)
      if (page < 3) expect(meta?.hasMore).toBeUndefined()
      else expect(meta?.hasMore).toBe(false)
    }
    const expected = Array.from({ length: N }, (_, i) =>
      resource === 'transactions' ? `T${i + 1}` : String(i + 1),
    )
    expect(seen).toEqual(expected)
    expect(calls.map((c) => [c.fromRecord, c.limitRecord])).toEqual([
      [0, L],
      [L, L],
      [2 * L, L],
    ])
  })

  it('ends on a short page when Summary has no total', async () => {
    serve(resource, 4, false)
    const params = withPageSink({ page: 2, limit: 3, ...extra })
    const rows = await call(params)
    expect(rows).toHaveLength(1)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('never sends limitRecord 0 ("return all records")', async () => {
    const calls = serve(resource, 2)
    await call(withPageSink({ page: 1, limit: 0, ...extra }))
    expect(calls[0]!.limitRecord).toBeGreaterThan(0)
  })

  it('sends the shared default page size when the caller gives no limit', async () => {
    const calls = serve(resource, 2)
    await call(withPageSink({ page: 1, ...extra } as QueryParams))
    expect(calls[0]!.limitRecord).toBe(DEFAULT_PAGE_LIMIT)
  })

  it('sends a large caller limit unclamped (no maximum is documented)', async () => {
    const calls = serve(resource, 2)
    await call(withPageSink({ page: 2, limit: 500, ...extra }))
    expect([calls[0]!.fromRecord, calls[0]!.limitRecord]).toEqual([500, 500])
  })

  it('refuses with 501 before any request when the connection has no entry', async () => {
    await expect(call({ page: 1, limit: 5, ...extra }, NO_ENTRY)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('listCharges date bound', () => {
  it('refuses the unfiltered 60-day default window with 501 and sends nothing', async () => {
    await expect(adapter.listCharges(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('last 60 days'),
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('sends transactionDate(ge) from updatedAfter and filters to Sale', async () => {
    const calls = serve('transactions', 1)
    await adapter.listCharges(CREDS, { page: 1, limit: 5, updatedAfter: AFTER })
    expect(calls[0]).toEqual({
      fromRecord: 0,
      limitRecord: 5,
      'transactionDate(ge)': '2024-04-01T00:00:00',
      'operation(eq)': 'Sale',
    })
  })
})

describe('listRefunds', () => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.listRefunds(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('invoices without a connection currency', () => {
  it('listInvoices refuses with 501 before any request', async () => {
    await expect(adapter.listInvoices(NO_CURRENCY, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('getInvoice refuses with 501 before any request', async () => {
    await expect(adapter.getInvoice(NO_CURRENCY, '3674')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('single-record reads hit the documented paths and read the body directly', () => {
  it.each([
    ['getCustomer', '4440', '/Customer/4440', CUSTOMERS_LIST.Records[0]],
    ['getCharge', '10-abc', '/MoneyIn/details/10-abc', TRANSACTIONS_LIST.Records[0]],
    ['getDispute', '578', '/ChargeBacks/read/578', CHARGEBACKS_LIST.Records[0]],
    ['getInvoice', '3674', '/Invoice/3674', INVOICES_LIST.Records[0]],
    ['getSubscription', '580', '/Subscription/580', SUBSCRIPTIONS_LIST.Records[0]],
  ] as const)('%s', async (method, id, path, body) => {
    getMock.mockResolvedValueOnce(body)
    const out = await (
      adapter[method] as (c: Credentials, id: string) => Promise<{ id: string }>
    ).call(adapter, CREDS, id)
    expect(getMock).toHaveBeenCalledWith(path)
    expect(out.id).toBeTruthy()
  })
})

describe('client', () => {
  it('sends the API token in requestToken to the production host', () => {
    const http = (
      new PayabliClient({ accessToken: 'tok-1' }) as unknown as {
        http: { defaults: { baseURL: string; headers: Record<string, unknown> } }
      }
    ).http
    expect(http.defaults.baseURL).toBe('https://api.payabli.com/api')
    expect(http.defaults.headers.requestToken).toBe('tok-1')
    expect(http.defaults.headers.Authorization).toBeUndefined()
  })
})

describe('disputes fall back to the connection currency', () => {
  // Both documented chargeback examples carry paymentDetails.currency; strip
  // it from the top level and from Transaction so only the connection's remains.
  const bare = (r: Record<string, unknown>) => {
    const {
      PaymentData: _p,
      Transaction: t,
      ...rest
    } = r as {
      PaymentData?: unknown
      Transaction?: Record<string, unknown>
    }
    const { PaymentData: _tp, ...tRest } = t ?? {}
    return { ...rest, Transaction: tRest }
  }
  const CAD: Credentials = { accessToken: 'tok', extra: { entry: ENTRY, currency: 'CAD' } }

  it('listDisputes uses the connection currency for a row with no paymentDetails.currency', async () => {
    getMock.mockResolvedValueOnce({
      Records: [bare(CHARGEBACKS_LIST.Records[0])],
      Summary: { totalRecords: 1 },
    })
    const [d] = await adapter.listDisputes(CAD, withPageSink({ page: 1, limit: 5 }))
    expect(d!.currency).toBe('CAD')
  })

  it('getDispute uses the connection currency for a record with no paymentDetails.currency', async () => {
    getMock.mockResolvedValueOnce(bare(CHARGEBACKS_LIST.Records[0]))
    const d = await adapter.getDispute(CAD, '578')
    expect(d.currency).toBe('CAD')
  })
})

describe('connection currency', () => {
  it('ignores a value that is not a 3-letter ISO code', async () => {
    const creds: Credentials = { accessToken: 'tok', extra: { entry: ENTRY, currency: 'usd' } }
    await expect(adapter.listInvoices(creds, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('exchangeCredentials', () => {
  it('keeps entry and currency in extra and the token in accessToken', async () => {
    await expect(
      adapter.exchangeCredentials({ apiKey: 'k', entry: ENTRY, currency: 'CAD' }),
    ).resolves.toEqual({ accessToken: 'k', extra: { entry: ENTRY, currency: 'CAD' } })
  })
})
