/**
 * Payrexx list paging, against a fake upstream that honours only the
 * documented parameters.
 *
 * Invoices, payouts and subscriptions (list and get) refuse with 501 until
 * their transforms are rebuilt against the docs; see the refusal block below.
 * The fake still answers /Bill/, /Payout/ and /Subscription/, so a refusal
 * that regressed into a request would be recorded.
 *
 * GET /PaymentMethod/ ("Get All Active Payment Methods",
 * https://developers.payrexx.com/reference/get-all-active-payment-methods.md)
 * documents only filterCurrency, filterPaymentType and filterPsp: one response
 * is the whole collection, so the caller's page is cut locally.
 *
 * GET /Transaction/ ("Retrieve Transactions",
 * https://developers.payrexx.com/reference/retrieve-transactions.md) documents
 * `limit` ("Max row count") and `offset` ("Row count to be used as offset")
 * and no maximum, total or end signal, so a short page ends the collection.
 * listCharges used to call an invented `/charges`.
 *
 * Every list method used to send `limit` alone, so page 2 repeated page 1.
 *
 * Every call must carry the documented auth and instance: "You can
 * authenticate by simply passing your API Secret via the HTTP header
 * X-API-KEY: YOUR_API_SECRET", and the base URL is
 * "https://api.payrexx.com/v1.0/:object/:id?instance=:instance"
 * (https://developers.payrexx.com/reference/rest-api.md). The client used to
 * send `Authorization: Bearer` and no instance.
 *
 * The fake answers GET at the seam the client uses (the axios instance
 * `axios.create` returns), rejects a call without the X-API-KEY header or the
 * instance, and rejects any other parameter the docs do not list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { PayrexxAdapter } from '../../../../../../src/verticals/payments/adapters/payrexx/index'
import { PayrexxClient } from '../../../../../../src/verticals/payments/adapters/payrexx/client'

const SECRET = 'payrexx-secret'
const INSTANCE = 'acme'
const creds = { accessToken: SECRET, extra: { instance: INSTANCE } }

class UpstreamError extends Error {}

type Params = Record<string, unknown> | undefined

let requests: { url: string; params: Params }[] = []

/** Documented default for `limit` on the offset endpoints. */
const DOC_DEFAULT_LIMIT = 10

const OFFSET_PATHS = ['/Subscription/', '/Payout/', '/Bill/', '/Transaction/'] as const
type OffsetPath = (typeof OFFSET_PATHS)[number]

function readInt(v: unknown, name: string, fallback: number): number {
  if (v === undefined) return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new UpstreamError(`bad ${name} ${String(v)}`)
  return n
}

/**
 * Serves `n` rows with uuid 1..n on every offset endpoint (transactions carry
 * the integer `id` the docs show, with the documented invoice money) and `n`
 * payment methods named m1..mn on /PaymentMethod/.
 */
function serve(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ uuid: String(i + 1), status: 'active' }))
  const transactions = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    status: 'confirmed',
    invoice: { currencyAlpha3: 'CHF', totalAmount: 100 * (i + 1) },
  }))
  const methods = Array.from({ length: n }, (_, i) => ({ name: `m${i + 1}` }))
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => ({
    get: vi.fn(async (url: string, req?: { params?: Record<string, unknown> }) => {
      if (config?.headers?.['X-API-KEY'] !== SECRET) throw new UpstreamError('missing X-API-KEY')
      if ('Authorization' in (config?.headers ?? {}))
        throw new UpstreamError('undocumented Authorization header')
      const { instance, ...rest } = req?.params ?? {}
      if (instance !== INSTANCE) throw new UpstreamError(`missing instance ${String(instance)}`)
      const params: Params = req?.params ? rest : undefined
      requests.push({ url, params })
      if (url === '/PaymentMethod/') {
        const allowed = new Set(['filterCurrency', 'filterPaymentType', 'filterPsp'])
        for (const k of Object.keys(params ?? {})) {
          if (!allowed.has(k)) throw new UpstreamError(`undocumented param ${k}`)
        }
        return { data: { status: 'success', data: methods } }
      }
      if (!(OFFSET_PATHS as readonly string[]).includes(url)) {
        throw new UpstreamError(`unexpected url ${url}`)
      }
      for (const k of Object.keys(params ?? {})) {
        if (k !== 'offset' && k !== 'limit') throw new UpstreamError(`undocumented param ${k}`)
      }
      const offset = readInt(params?.['offset'], 'offset', 0)
      const limit = readInt(params?.['limit'], 'limit', DOC_DEFAULT_LIMIT)
      const source: { uuid?: string; id?: number }[] = url === '/Transaction/' ? transactions : rows
      const data = source.slice(offset, offset + limit)
      return { data: { status: 'success', data } }
    }),
  })) as unknown as typeof axios.create)
}

type OffsetMethod = 'listCharges'

const OFFSET_METHODS: { method: OffsetMethod; path: OffsetPath }[] = [
  { method: 'listCharges', path: '/Transaction/' },
]

async function call(method: OffsetMethod | 'listPaymentMethods', params: QueryParams) {
  const rows = await new PayrexxAdapter()[method](creds, params)
  return rows.map((r) => r.id)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(OFFSET_METHODS)('payrexx $method offset paging', ({ method, path }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const ids = await call(method, params)
      seen.push(...ids)
      hasMore.push(listPage(ids, params, 'payrexx').meta.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset = (page - 1) * limit on page 2', async () => {
    serve(7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toEqual([{ url: path, params: { limit: 3, offset: 3 } }])
  })

  it('sends offset 0 on page 1', async () => {
    serve(7)
    await call(method, withPageSink({ page: 1, limit: 3 }))
    expect(requests).toEqual([{ url: path, params: { limit: 3, offset: 0 } }])
  })

  it('serves every row at a large limit (no documented maximum to clamp to)', async () => {
    const N = 1205
    serve(N)
    const params = withPageSink({ page: 1, limit: 5000 })
    const ids = await call(method, params)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(listPage(ids, params, 'payrexx').meta.hasMore).toBe(false)
  })

  it('answers empty with hasMore false past the end', async () => {
    serve(7)
    const params = withPageSink({ page: 4, limit: 3 })
    const ids = await call(method, params)
    expect(ids).toEqual([])
    expect(listPage(ids, params, 'payrexx').meta.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const adapter = new PayrexxAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter as PageMaxBearing)
    const out = listPage(await call(method, params), params, 'payrexx')
    expect(out.data).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter as PageMaxBearing)
    const tail = listPage(await call(method, last), last, 'payrexx')
    expect(tail.data).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('payrexx listPaymentMethods local paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const ids = await call('listPaymentMethods', params)
      seen.push(...ids)
      hasMore.push(listPage(ids, params, 'payrexx').meta.hasMore)
    }
    expect(seen).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no paging parameter on page 2 (none is documented) and reports it paged locally', async () => {
    serve(7)
    const params = withPageSink({ page: 2, limit: 3 })
    expect(await call('listPaymentMethods', params)).toEqual(['m4', 'm5', 'm6'])
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('/PaymentMethod/')
    expect(Object.keys(requests[0]!.params ?? {})).toEqual([])
    const reported = readUpstreamPage(params)
    expect(reported?.pagedLocally).toBe(true)
    expect(reported?.totalCount).toBe(7)
    expect(reported?.hasMore).toBe(true)
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(6)
    const params = withPageSink({ page: 2, limit: 3 })
    expect(await call('listPaymentMethods', params)).toEqual(['m4', 'm5', 'm6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves every row at a large limit', async () => {
    serve(40)
    const params = withPageSink({ page: 1, limit: 5000 })
    const ids = await call('listPaymentMethods', params)
    expect(ids).toHaveLength(40)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const adapter = new PayrexxAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter as PageMaxBearing)
    const out = listPage(await adapter.listPaymentMethods(creds, params), params, 'payrexx')
    expect(out.data.map((r) => r.id)).toEqual(['m4', 'm5', 'm6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})

describe('payrexx getCharge', () => {
  it('reads GET /Transaction/{id}/ and its one-row data array', async () => {
    serveOne({
      status: 'success',
      data: [{ id: 1, status: 'confirmed', invoice: { currencyAlpha3: 'CHF', totalAmount: 9272 } }],
    })
    const charge = await new PayrexxAdapter().getCharge(creds, '1')
    expect(charge.id).toBe('1')
    expect(charge.amount).toBe(9272)
    expect(requests).toEqual([{ url: '/Transaction/1/', params: {} }])
  })

  it('encodes the id into the path segment', async () => {
    serveOne({
      status: 'success',
      data: [{ id: 1, status: 'confirmed', invoice: { currencyAlpha3: 'CHF', totalAmount: 1 } }],
    })
    await new PayrexxAdapter().getCharge(creds, 'a/b')
    expect(requests).toEqual([{ url: '/Transaction/a%2Fb/', params: {} }])
  })

  it('answers 404 when the data array is empty', async () => {
    serveOne({ status: 'success', data: [] })
    await expect(new PayrexxAdapter().getCharge(creds, '9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

/** Answers every GET with `body`, after the same auth and instance checks as serve(). */
function serveOne(body: unknown) {
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => ({
    get: vi.fn(async (url: string, req?: { params?: Record<string, unknown> }) => {
      if (config?.headers?.['X-API-KEY'] !== SECRET) throw new UpstreamError('missing X-API-KEY')
      const { instance, ...rest } = req?.params ?? {}
      if (instance !== INSTANCE) throw new UpstreamError(`missing instance ${String(instance)}`)
      requests.push({ url, params: rest })
      return { data: body }
    }),
  })) as unknown as typeof axios.create)
}

describe('payrexx refuses resources it has no API for, before sending anything', () => {
  // No customer or refund list exists among the 35 reference pages listed in
  // https://developers.payrexx.com/reference/rest-api; a refund is only the
  // action "Refund a Transaction" (POST /Transaction/{id}/refund,
  // https://developers.payrexx.com/reference/refund-a-transaction.md).
  it.each([
    [
      'listCustomers',
      (a: PayrexxAdapter) => a.listCustomers(creds, withPageSink({ page: 1, limit: 3 })),
    ],
    ['getCustomer', (a: PayrexxAdapter) => a.getCustomer(creds, '16')],
    [
      'listRefunds',
      (a: PayrexxAdapter) => a.listRefunds(creds, withPageSink({ page: 1, limit: 3 })),
    ],
  ] as const)('%s throws 501 NOT_SUPPORTED', async (_name, run) => {
    const create = vi.spyOn(axios, 'create')
    serve(7)
    await expect(run(new PayrexxAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })
})

describe('payrexx refuses invoice, payout and subscription reads until rebuilt, before sending anything', () => {
  // The transforms behind these six reads were never rebuilt against the docs.
  // Invoices: "Retrieve an Invoice" answers `"data": [ { ... "total": 2700,
  // ... "currency": "CHF" ... } ]` (https://developers.payrexx.com/reference/retrieve-an-invoice.md),
  // but the transform read `originalAmount` (so every amount was 0) and
  // getInvoice read `data` as an object. Subscriptions: "/Subscription/{id}/"
  // also answers `"data": [ { "id": 1, "uuid": "a5e0c919", ... } ]`
  // (https://developers.payrexx.com/reference/retrieve-a-subscription.md),
  // read as an object. All three transforms invented 'CHF' when no currency
  // was read.
  const page = () => withPageSink({ page: 1, limit: 3 })
  it.each([
    [
      'listInvoices',
      /^Payrexx cannot list invoices:/,
      (a: PayrexxAdapter) => a.listInvoices(creds, page()),
    ],
    [
      'getInvoice',
      /^Payrexx cannot read an invoice:/,
      (a: PayrexxAdapter) => a.getInvoice(creds, 'md021nl8'),
    ],
    [
      'listPayouts',
      /^Payrexx cannot list payouts:/,
      (a: PayrexxAdapter) => a.listPayouts(creds, page()),
    ],
    [
      'getPayout',
      /^Payrexx cannot read a payout:/,
      (a: PayrexxAdapter) => a.getPayout(creds, 'C6B438B9'),
    ],
    [
      'listSubscriptions',
      /^Payrexx cannot list subscriptions:/,
      (a: PayrexxAdapter) => a.listSubscriptions(creds, page()),
    ],
    [
      'getSubscription',
      /^Payrexx cannot read a subscription:/,
      (a: PayrexxAdapter) => a.getSubscription(creds, 'a5e0c919'),
    ],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, noun, run) => {
    // A fake that would answer any GET, so a regression into a request is recorded.
    serveOne({ status: 'success', data: [{ uuid: 'x', total: 2700, currency: 'CHF' }] })
    const create = vi.mocked(axios.create)
    await expect(run(new PayrexxAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(noun),
    })
    expect(requests).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })
})

describe('payrexx instance', () => {
  it('refuses with 501 naming the instance, sending nothing, when the connection has none', async () => {
    serve(7)
    await expect(
      new PayrexxAdapter().listCharges(
        { accessToken: SECRET },
        withPageSink({ page: 1, limit: 3 }),
      ),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/instance/),
    })
    expect(requests).toEqual([])
  })

  it('collects the API secret and the instance name and stores the instance in extra', async () => {
    const adapter = new PayrexxAdapter()
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['apiKey', true],
      ['instance', true],
    ])
    await expect(
      adapter.exchangeCredentials({ apiKey: ' s3cret ', instance: ' acme ' }),
    ).resolves.toEqual({
      accessToken: 's3cret',
      extra: { instance: 'acme' },
    })
    await expect(adapter.exchangeCredentials({ apiKey: 's3cret' })).rejects.toThrow(/instance/)
    await expect(adapter.exchangeCredentials({ instance: 'acme' })).rejects.toThrow(/API Secret/)
  })
})

describe('payrexx client POST and DELETE', () => {
  // "For POST requests all query parameters except the instance have to be in
  // the body" (https://developers.payrexx.com/reference/rest-api.md): the
  // instance stays in the query string on every verb.
  it('keeps ?instance= in the query string on POST and DELETE', async () => {
    const calls: { verb: string; config?: { params?: Record<string, unknown> } }[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      post: vi.fn(
        async (_url: string, _body: unknown, config?: { params?: Record<string, unknown> }) => {
          calls.push({ verb: 'post', config })
          return { data: {} }
        },
      ),
      delete: vi.fn(async (_url: string, config?: { params?: Record<string, unknown> }) => {
        calls.push({ verb: 'delete', config })
        return { data: {} }
      }),
    })) as unknown as typeof axios.create)
    const client = new PayrexxClient(creds)
    await client.post('/Gateway/', { amount: 1 })
    await client.delete('/Gateway/1/')
    expect(calls).toEqual([
      { verb: 'post', config: { params: { instance: INSTANCE } } },
      { verb: 'delete', config: { params: { instance: INSTANCE } } },
    ])
  })
})
