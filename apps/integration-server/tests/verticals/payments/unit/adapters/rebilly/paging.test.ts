/**
 * Rebilly list paging, auth and host.
 *
 * First-party spec (https://github.com/Rebilly/api-definitions, openapi/):
 *   - servers: "https://api.rebilly.com/organizations/{organizationId}" (live),
 *     "https://api-sandbox.rebilly.com/organizations/{organizationId}" (sandbox);
 *   - SecretApiKey: "name: REB-APIKEY, type: apiKey, in: header";
 *   - collectionLimit.yaml / collectionOffset.yaml: "maximum: 1000";
 *     invoiceCollectionLimit.yaml: "Cap values greater than `100` at `100`.";
 *   - every collection answers `type: array` with a `Pagination-Total` header,
 *     "Total number of items that match the request."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { RebillyAdapter } from '../../../../../../src/verticals/payments/adapters/rebilly/index'

const ORG = 'org-123'
const CREDS: Credentials = { accessToken: 'sk_live_abc', extra: { organizationId: ORG } }

/** Query params each GET collection declares in paths/<resource>.yaml. */
const COMMON = ['limit', 'offset', 'filter', 'sort', 'q']
const DOCUMENTED: Record<string, Set<string>> = {
  '/customers': new Set([...COMMON, 'expand', 'fields']),
  '/transactions': new Set([...COMMON, 'expand']),
  '/subscriptions': new Set([...COMMON, 'expand']),
  '/invoices': new Set([...COMMON, 'expand']),
  '/plans': new Set(COMMON),
  '/disputes': new Set([...COMMON, 'expand']),
  '/payment-instruments': new Set([...COMMON, 'expand']),
  '/balance-transactions': new Set(['limit', 'offset', 'filter', 'sort']),
}
const MAX: Record<string, number> = { '/invoices': 100 }

function httpError(status: number, msg: string): Error {
  return Object.assign(new Error(`${status} ${msg}`), { response: { status } })
}

function row(path: string, id: string, filter: string | undefined): Record<string, unknown> {
  const base = { id, createdTime: '2026-01-15T09:30:00Z', updatedTime: '2026-01-16T09:30:00Z' }
  switch (path) {
    case '/customers':
      return { ...base, email: `${id}@example.com`, firstName: 'Jane', lastName: 'Doe' }
    case '/transactions': {
      const type = (filter ?? 'type:sale').replace(/^type:/, '').split(',')[0]
      return {
        ...base,
        type,
        status: 'completed',
        result: 'approved',
        amount: 10.5,
        currency: 'USD',
        parentTransactionId: type === 'refund' ? 'txn_parent' : null,
      }
    }
    case '/subscriptions':
      return {
        ...base,
        orderType: 'subscription-order',
        customerId: 'cus_1',
        status: 'active',
        items: [],
      }
    case '/invoices':
      return { ...base, customerId: 'cus_1', currency: 'USD', amount: 5, status: 'paid' }
    case '/plans':
      return {
        ...base,
        type: 'subscription',
        name: 'Monthly',
        productId: 'prod_1',
        currency: 'USD',
        pricing: { formula: 'fixed-fee', price: 9.99 },
        recurringInterval: { unit: 'month', length: 1 },
      }
    case '/disputes':
      return { ...base, transactionId: 'txn_1', currency: 'USD', amount: 3, status: 'won' }
    case '/payment-instruments':
      return { ...base, method: 'payment-card', customerId: 'cus_1', last4: '4242' }
    case '/balance-transactions':
      return { ...base, type: 'charge', settlementAmount: 7, settlementCurrency: 'USD' }
    default:
      throw httpError(404, path)
  }
}

interface Sent {
  baseURL: string
  headers: Record<string, unknown>
  path: string
  params: Record<string, unknown>
}

/** A fake Rebilly holding `n` rows per collection, honouring only documented params. */
function fakeRebilly(n: number, opts: { omitTotal?: boolean } = {}) {
  const sent: Sent[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config: {
    baseURL: string
    headers: Record<string, unknown>
  }) => ({
    get: vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = cfg?.params ?? {}
      sent.push({ baseURL: config.baseURL, headers: config.headers, path, params })
      const documented = DOCUMENTED[path]
      if (!documented) throw httpError(404, path)
      for (const k of Object.keys(params))
        if (!documented.has(k)) throw httpError(400, `unknown ${k}`)
      const limit = Number(params.limit ?? 100)
      const offset = Number(params.offset ?? 0)
      if (!Number.isInteger(limit) || limit < 0 || limit > 1000) throw httpError(422, 'limit')
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw httpError(422, 'offset')
      const size = Math.min(limit, MAX[path] ?? 1000)
      const ids = Array.from({ length: n }, (_, i) => `${path.slice(1)}_${i + 1}`)
      const filter = params.filter as string | undefined
      return {
        data: ids.slice(offset, offset + size).map((id) => row(path, id, filter)),
        headers: opts.omitTotal ? {} : { 'pagination-total': String(n) },
      }
    }),
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { sent }
}

afterEach(() => vi.restoreAllMocks())

type ListMethod =
  | 'listCustomers'
  | 'listCharges'
  | 'listRefunds'
  | 'listSubscriptions'
  | 'listInvoices'
  | 'listPlans'
  | 'listDisputes'
  | 'listPaymentMethods'
  | 'listPayouts'
  | 'listBalanceTransactions'

const CASES: Array<{ method: ListMethod; path: string; filter?: string }> = [
  { method: 'listCustomers', path: '/customers' },
  { method: 'listCharges', path: '/transactions', filter: 'type:sale,authorize,capture' },
  { method: 'listRefunds', path: '/transactions', filter: 'type:refund' },
  { method: 'listPayouts', path: '/transactions', filter: 'type:credit' },
  { method: 'listSubscriptions', path: '/subscriptions', filter: 'orderType:subscription-order' },
  { method: 'listInvoices', path: '/invoices' },
  {
    method: 'listPlans',
    path: '/plans',
    filter: 'type:subscription;pricing.formula:fixed-fee,flat-rate',
  },
  { method: 'listDisputes', path: '/disputes' },
  { method: 'listPaymentMethods', path: '/payment-instruments' },
  { method: 'listBalanceTransactions', path: '/balance-transactions' },
]

async function callPage(method: ListMethod, page: number, limit: number, creds = CREDS) {
  const params: QueryParams = withPageSink({ page, limit })
  const adapter = new RebillyAdapter()
  const rows = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), meta: readUpstreamPage(params) }
}

describe('rebilly list requests', () => {
  it.each(CASES)(
    '$method sends limit/offset (and its filter) to the org-scoped live host with REB-APIKEY',
    async (c) => {
      const { sent } = fakeRebilly(30)
      await callPage(c.method, 3, 7)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.baseURL).toBe(`https://api.rebilly.com/organizations/${ORG}`)
      expect(sent[0]!.headers['REB-APIKEY']).toBe('sk_live_abc')
      expect(sent[0]!.headers['Authorization']).toBeUndefined()
      expect(sent[0]!.path).toBe(c.path)
      const expected: Record<string, unknown> = { limit: 7, offset: 14 }
      if (c.filter) expected.filter = c.filter
      expect(sent[0]!.params).toEqual(expected)
    },
  )

  it('uses the sandbox host for a sk_sandbox_ key', async () => {
    const { sent } = fakeRebilly(3)
    await callPage('listCustomers', 1, 5, {
      accessToken: 'sk_sandbox_x',
      extra: { organizationId: ORG },
    })
    expect(sent[0]!.baseURL).toBe(`https://api-sandbox.rebilly.com/organizations/${ORG}`)
  })

  it('refuses a connection without an organization ID before sending', async () => {
    const { sent } = fakeRebilly(3)
    await expect(
      callPage('listCustomers', 1, 5, { accessToken: 'sk_live_abc' }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })

  it('exchangeCredentials stores the organization ID and refuses without it', async () => {
    const adapter = new RebillyAdapter()
    await expect(
      adapter.exchangeCredentials({ apiKey: ' sk_live_k ', organizationId: ' org-9 ' }),
    ).resolves.toEqual({ accessToken: 'sk_live_k', extra: { organizationId: 'org-9' } })
    await expect(adapter.exchangeCredentials({ apiKey: 'sk_live_k' })).rejects.toMatchObject({
      statusCode: 501,
    })
  })
})

describe('rebilly paging walk', () => {
  it.each(CASES.filter((c) => c.path !== '/invoices'))(
    '$method serves every row once over N = 2L+1 with exact hasMore',
    async (c) => {
      const L = 4
      const N = 2 * L + 1
      fakeRebilly(N)
      const seen: string[] = []
      const metas = []
      for (let page = 1; page <= 3; page++) {
        const { ids, meta } = await callPage(c.method, page, L)
        seen.push(...ids)
        metas.push(meta)
      }
      expect(seen).toHaveLength(N)
      expect(new Set(seen).size).toBe(N)
      expect(metas.map((m) => m?.hasMore)).toEqual([true, true, false])
      expect(metas.every((m) => m?.totalCount === N)).toBe(true)
    },
  )

  it('listInvoices clamps limit to 100, reports pageSize 100 and strides by it', async () => {
    const { sent } = fakeRebilly(250)
    const seen: string[] = []
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const { ids, meta } = await callPage('listInvoices', page, 500)
      seen.push(...ids)
      metas.push(meta)
    }
    expect(sent.map((s) => s.params)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
    ])
    expect(new Set(seen).size).toBe(250)
    expect(metas.map((m) => m?.pageSize)).toEqual([100, 100, 100])
    expect(metas.map((m) => m?.hasMore)).toEqual([true, true, false])
  })

  it('clamps a limit above 1000 and reports the size sent', async () => {
    const { sent } = fakeRebilly(5)
    const { meta } = await callPage('listCustomers', 1, 5000)
    expect(sent[0]!.params).toEqual({ limit: 1000, offset: 0 })
    expect(meta?.pageSize).toBe(1000)
  })

  it('leaves hasMore unknown when Pagination-Total is absent', async () => {
    fakeRebilly(10, { omitTotal: true })
    const { ids, meta } = await callPage('listCustomers', 1, 4)
    expect(ids).toHaveLength(4)
    expect(meta?.hasMore).toBeUndefined()
    expect(meta?.totalCount).toBeUndefined()
  })

  it('refuses a page whose offset is past the documented maximum, without sending', async () => {
    const { sent } = fakeRebilly(5000)
    // offset 1000 is the last documented start: served.
    const last = await callPage('listCustomers', 3, 500)
    expect(sent[0]!.params).toEqual({ limit: 500, offset: 1000 })
    expect(last.meta?.hasMore).toBe(true)
    await expect(callPage('listCustomers', 4, 500)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(1)
  })
})

describe('rebilly get methods', () => {
  function fakeGet(body: Record<string, unknown>) {
    const sent: string[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string) => {
        sent.push(path)
        return { data: body, headers: {} }
      }),
      post: vi.fn(),
      delete: vi.fn(),
    })) as never)
    return sent
  }

  const txn = {
    id: 'txn_1',
    status: 'completed',
    result: 'approved',
    amount: 1,
    currency: 'USD',
  }

  it('getCharge reads /transactions/{id} and refuses a non-charge type', async () => {
    const sent = fakeGet({ ...txn, type: 'sale' })
    await expect(new RebillyAdapter().getCharge(CREDS, 'txn_1')).resolves.toMatchObject({
      id: 'txn_1',
    })
    expect(sent).toEqual(['/transactions/txn_1'])
    vi.restoreAllMocks()
    fakeGet({ ...txn, type: 'refund', parentTransactionId: 'p' })
    await expect(new RebillyAdapter().getCharge(CREDS, 'txn_1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getPayout reads /transactions/{id} of type credit', async () => {
    const sent = fakeGet({ ...txn, type: 'credit' })
    await expect(new RebillyAdapter().getPayout(CREDS, 'txn_1')).resolves.toMatchObject({
      status: 'paid',
    })
    expect(sent).toEqual(['/transactions/txn_1'])
  })

  it('getBalanceTransaction reads /balance-transactions/{id}', async () => {
    const sent = fakeGet({
      id: 'btxn_1',
      type: 'charge',
      settlementAmount: 2,
      settlementCurrency: 'EUR',
    })
    await expect(
      new RebillyAdapter().getBalanceTransaction(CREDS, 'btxn_1'),
    ).resolves.toMatchObject({
      amount: 200,
      currency: 'EUR',
    })
    expect(sent).toEqual(['/balance-transactions/btxn_1'])
  })

  it('getSubscription refuses a one-time order', async () => {
    fakeGet({ id: 'ord_1', orderType: 'one-time-order', customerId: 'cus_1', items: [] })
    await expect(new RebillyAdapter().getSubscription(CREDS, 'ord_1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getCustomer reads the bare object body', async () => {
    const sent = fakeGet({ id: 'cus_1', firstName: 'Jane', lastName: 'Doe' })
    await expect(new RebillyAdapter().getCustomer(CREDS, 'cus_1')).resolves.toMatchObject({
      id: 'cus_1',
      name: 'Jane Doe',
    })
    expect(sent).toEqual(['/customers/cus_1'])
  })
})
