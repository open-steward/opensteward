/**
 * Kill Bill list/get methods on the documented /1.0/kb paths
 * (https://killbill.github.io/slate/).
 *
 * The fake honours ONLY `offset` and `limit` on `/pagination` endpoints
 * (documented defaults 0 and 100) and sets X-Killbill-Pagination-NextOffset
 * only "if there are additional entries to return", with -TotalNbRecords.
 * Anything else — an undocumented path, a stray parameter — fails the test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { KillbillAdapter } from '../../../../../../src/verticals/payments/adapters/killbill/index'

let tokenSeq = 0
/** Fresh credentials per test: the row pager keys its memory by connection. */
function creds(): {
  accessToken: string
  extra: { serverUrl: string; apiKey: string; apiSecret: string }
} {
  tokenSeq++
  return {
    accessToken: `dG9rZW4${tokenSeq}`,
    extra: { serverUrl: 'https://kb.example.com', apiKey: 'bob', apiSecret: 'lazar' },
  }
}

interface Req {
  path: string
  params: Record<string, unknown>
}

interface Fake {
  reqs: Req[]
  config: { baseURL?: string; headers?: Record<string, string> }
}

function fake(
  lists: Record<string, Array<Record<string, unknown>>>,
  byId: Record<string, unknown> = {},
  whole: Record<string, unknown> = {},
): Fake {
  const out: Fake = { reqs: [], config: {} }
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    out.reqs.push({ path, params })
    if (path in lists) {
      for (const k of Object.keys(params))
        if (k !== 'offset' && k !== 'limit') throw new Error(`undocumented param ${k}`)
      const all = lists[path]!
      const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
      const limit = params['limit'] === undefined ? 100 : Number(params['limit'])
      const data = all.slice(offset, offset + limit)
      const headers: Record<string, string> = {
        'x-killbill-pagination-currentoffset': String(offset),
        'x-killbill-pagination-totalnbrecords': String(all.length),
      }
      if (offset + data.length < all.length)
        headers['x-killbill-pagination-nextoffset'] = String(offset + data.length)
      return { data, headers }
    }
    if (path in whole) {
      if (Object.keys(params).length > 0) throw new Error('undocumented params')
      return { data: whole[path], headers: {} }
    }
    if (path in byId) return { data: byId[path], headers: {} }
    throw Object.assign(new Error(`unexpected path ${path}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Fake['config']) => {
    out.config = cfg
    return { get, post: vi.fn(), delete: vi.fn(), defaults: {} }
  }) as never)
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function walk<T extends { id: string }>(
  call: (p: QueryParams) => Promise<T[]>,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined> }> {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const rows = await call(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore }
}

const tx = (paymentId: string, transactionId: string, transactionType: string) => ({
  transactionId,
  paymentId,
  transactionType,
  amount: 1,
  currency: 'USD',
  effectiveDate: '2018-07-19T16:39:00.000Z',
  status: 'SUCCESS',
})

describe('Kill Bill auth', () => {
  it('sends Basic auth plus the tenant headers to the connection server', async () => {
    const f = fake({ '/1.0/kb/accounts/pagination': [] })
    await new KillbillAdapter().listCustomers(
      creds(),
      withPageSink({ page: 1, limit: 2 } as QueryParams),
    )
    expect(f.config.baseURL).toBe('https://kb.example.com')
    expect(f.config.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      'X-Killbill-ApiKey': 'bob',
      'X-Killbill-ApiSecret': 'lazar',
    })
  })

  it('builds credentials from the five documented fields', async () => {
    const c = await new KillbillAdapter().exchangeCredentials({
      serverUrl: 'https://kb.example.com/',
      username: 'admin',
      password: 'password',
      apiKey: 'bob',
      apiSecret: 'lazar',
    })
    expect(c.accessToken).toBe(Buffer.from('admin:password').toString('base64'))
    expect(c.extra).toEqual({
      serverUrl: 'https://kb.example.com',
      apiKey: 'bob',
      apiSecret: 'lazar',
    })
  })

  it('refuses a connection missing only the tenant secret, sending nothing', async () => {
    const f = fake({ '/1.0/kb/accounts/pagination': [] })
    const c = creds()
    const noSecret = { ...c, extra: { serverUrl: c.extra.serverUrl, apiKey: c.extra.apiKey } }
    await expect(
      new KillbillAdapter().listCustomers(noSecret, { page: 1, limit: 2 } as QueryParams),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(f.reqs).toEqual([])
  })

  it('refuses a connection with no server or tenant, sending nothing', async () => {
    const f = fake({ '/1.0/kb/accounts/pagination': [] })
    await expect(
      new KillbillAdapter().listCustomers({ accessToken: 'x' }, {
        page: 1,
        limit: 2,
      } as QueryParams),
    ).rejects.toThrow(/reconnect/)
    expect(f.reqs).toEqual([])
  })
})

describe('Kill Bill offset lists', () => {
  it('listCustomers walks /1.0/kb/accounts/pagination: 2L+1 once each, exact hasMore', async () => {
    const L = 3
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      accountId: `acc-${i}`,
      name: `N${i}`,
    }))
    const f = fake({ '/1.0/kb/accounts/pagination': all })
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listCustomers(c, p), L, 3)
    expect(ids).toEqual(all.map((r) => r.accountId))
    expect(hasMore).toEqual([true, true, false])
    expect(f.reqs.map((r) => r.params)).toEqual([
      { limit: L, offset: 0 },
      { limit: L, offset: L },
      { limit: L, offset: 2 * L },
    ])
  })

  it('listCharges walks /1.0/kb/payments/pagination and leaves out CREDIT payments', async () => {
    const L = 2
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      paymentId: `pay-${i}`,
      accountId: 'acc-1',
      currency: 'USD',
      transactions: [tx(`pay-${i}`, `t-${i}`, i === 1 ? 'CREDIT' : 'PURCHASE')],
    }))
    fake({ '/1.0/kb/payments/pagination': all })
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listCharges(c, p), L, 3)
    expect(ids).toEqual(['pay-0', 'pay-2', 'pay-3', 'pay-4'])
    expect(hasMore).toEqual([true, true, false])
    // TotalNbRecords counts every payment (5), not the 4 charges: not reported.
    const p = withPageSink({ page: 1, limit: L } as QueryParams)
    await a.listCharges(c, p)
    expect(readUpstreamPage(p)?.hasMore).toBe(true)
    expect(readUpstreamPage(p)?.totalCount).toBeUndefined()
  })

  it('sends the documented default limit of 100 when the caller sends none', async () => {
    const all = Array.from({ length: 150 }, (_, i) => ({ accountId: `acc-${i}` }))
    const f = fake({ '/1.0/kb/accounts/pagination': all })
    const a = new KillbillAdapter()
    const c = creds()
    const second = await a.listCustomers(c, withPageSink({ page: 2 } as QueryParams))
    expect(f.reqs[0]!.params).toEqual({ limit: 100, offset: 100 })
    expect(second.map((r) => r.id)).toEqual(all.slice(100).map((r) => r.accountId))
  })

  it('listInvoices reads each listed invoice back by id for its amount and balance', async () => {
    const L = 2
    const list = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      invoiceId: `inv-${i}`,
      amount: 0,
      balance: 0,
      currency: 'USD',
      status: 'COMMITTED',
    }))
    const byId: Record<string, unknown> = {}
    for (const r of list) byId[`/1.0/kb/invoices/${r.invoiceId}`] = { ...r, amount: 10, balance: 4 }
    const f = fake({ '/1.0/kb/invoices/pagination': list }, byId)
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listInvoices(c, p), L, 3)
    const first = await a.listInvoices(c, withPageSink({ page: 1, limit: L } as QueryParams))
    expect(first.map((i) => [i.total, i.amountDue])).toEqual([
      [1000, 400],
      [1000, 400],
    ])
    expect(ids).toEqual(list.map((r) => r.invoiceId))
    expect(hasMore).toEqual([true, true, false])
    const one = await a.getInvoice(c, 'inv-0')
    expect([one.total, one.amountDue, one.status]).toEqual([1000, 400, 'open'])
    expect(f.reqs.filter((r) => r.path.startsWith('/1.0/kb/invoices/inv-')).length).toBe(
      2 * L + 1 + L + 1,
    )
  })
})

describe('Kill Bill flattened lists (pageByRows)', () => {
  it('listRefunds flattens REFUND transactions across uneven upstream pages: 2L+1 once each', async () => {
    // 150 payments over two upstream pages of 100; refunds per payment cycle 0,1,2.
    const payments = Array.from({ length: 150 }, (_, i) => ({
      paymentId: `pay-${i}`,
      currency: 'USD',
      transactions: [
        tx(`pay-${i}`, `p-${i}`, 'PURCHASE'),
        ...Array.from({ length: i % 3 }, (_, j) => tx(`pay-${i}`, `r-${i}-${j}`, 'REFUND')),
      ],
    }))
    const expected = payments.flatMap((p) =>
      p.transactions.filter((t) => t.transactionType === 'REFUND').map((t) => t.transactionId),
    )
    // 150 payments give 150 refunds; drop one to make 2L+1.
    payments[149]!.transactions.pop()
    expected.pop()
    const L = (expected.length - 1) / 2
    expect(Number.isInteger(L)).toBe(true)
    const f = fake({ '/1.0/kb/payments/pagination': payments })
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listRefunds(c, p), L, 3)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(ids.length)
    expect(hasMore).toEqual([true, true, false])
    for (const r of f.reqs) expect(r.params['limit']).toBe(100)
  })

  it('listRefunds keeps paging past a full upstream page when no pagination header arrives', async () => {
    // Rows only, no X-Killbill-Pagination-* headers (e.g. stripped by a proxy).
    const payments = Array.from({ length: 150 }, (_, i) => ({
      paymentId: `pay-${i}`,
      currency: 'USD',
      transactions: [tx(`pay-${i}`, `r-${i}`, 'REFUND')],
    }))
    const reqs: Req[] = []
    const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const params = { ...(config?.params ?? {}) }
      reqs.push({ path, params })
      const offset = Number(params['offset'] ?? 0)
      const limit = Number(params['limit'] ?? 100)
      return { data: payments.slice(offset, offset + limit), headers: {} }
    })
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get,
      post: vi.fn(),
      delete: vi.fn(),
      defaults: {},
    })) as never)
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listRefunds(c, p), 120, 2)
    expect(ids).toEqual(payments.map((p) => `r-${p.paymentId.slice(4)}`))
    expect(hasMore).toEqual([true, false])
  })

  it('listSubscriptions flattens bundle.subscriptions from /1.0/kb/bundles/pagination', async () => {
    const bundles = Array.from({ length: 130 }, (_, i) => ({
      bundleId: `b-${i}`,
      accountId: 'acc-1',
      subscriptions: Array.from({ length: i % 2 === 0 ? 1 : 0 }, () => ({
        subscriptionId: `s-${i}`,
        accountId: 'acc-1',
        state: 'ACTIVE',
      })),
    }))
    const expected = bundles.flatMap((b) => b.subscriptions.map((s) => s.subscriptionId))
    expect(expected.length).toBe(65)
    const L = 32
    const f = fake({ '/1.0/kb/bundles/pagination': bundles })
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listSubscriptions(c, p), L, 3)
    expect(ids).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
    expect(new Set(f.reqs.map((r) => r.path))).toEqual(new Set(['/1.0/kb/bundles/pagination']))
  })
})

describe('Kill Bill plans (pageLocally over availableBasePlans)', () => {
  it('pages the whole base-plan list locally and reads a plan back by id', async () => {
    const details = [
      {
        product: 'Sports',
        plan: 'sports-monthly',
        priceList: 'DEFAULT',
        finalPhaseBillingPeriod: 'MONTHLY',
        finalPhaseRecurringPrice: [
          { currency: 'GBP', value: 375 },
          { currency: 'USD', value: 500 },
        ],
      },
      {
        product: 'Standard',
        plan: 'standard-monthly',
        priceList: 'DEFAULT',
        finalPhaseBillingPeriod: 'MONTHLY',
        finalPhaseRecurringPrice: [
          { currency: 'GBP', value: 75 },
          { currency: 'USD', value: 100 },
        ],
      },
      {
        product: 'Super',
        plan: 'super-annual',
        priceList: 'DEFAULT',
        finalPhaseBillingPeriod: 'ANNUAL',
        finalPhaseRecurringPrice: [{ currency: 'USD', value: 1000 }],
      },
    ]
    const f = fake({}, {}, { '/1.0/kb/catalog/availableBasePlans': details })
    const a = new KillbillAdapter()
    const c = creds()
    const { ids, hasMore } = await walk((p) => a.listPlans(c, p), 2, 3)
    expect(ids).toEqual([
      'sports-monthly:GBP',
      'sports-monthly:USD',
      'standard-monthly:GBP',
      'standard-monthly:USD',
      'super-annual:USD',
    ])
    expect(hasMore).toEqual([true, true, false])
    expect((await a.getPlan(c, 'super-annual:USD')).amount).toBe(100000)
    await expect(a.getPlan(c, 'nope:USD')).rejects.toMatchObject({ statusCode: 404 })
    expect(new Set(f.reqs.map((r) => r.path))).toEqual(
      new Set(['/1.0/kb/catalog/availableBasePlans']),
    )
  })
})

describe('Kill Bill get-by-id paths', () => {
  it('reads accounts, payments, subscriptions and payment methods from /1.0/kb/{resource}/{id}', async () => {
    const f = fake(
      {},
      {
        '/1.0/kb/accounts/acc-1': { accountId: 'acc-1' },
        '/1.0/kb/payments/pay-1': {
          paymentId: 'pay-1',
          currency: 'USD',
          transactions: [tx('pay-1', 't', 'AUTHORIZE')],
        },
        '/1.0/kb/payments/pay-2': {
          paymentId: 'pay-2',
          currency: 'USD',
          transactions: [tx('pay-2', 't', 'CREDIT')],
        },
        '/1.0/kb/subscriptions/s-1': { subscriptionId: 's-1', accountId: 'acc-1', state: 'ACTIVE' },
        '/1.0/kb/paymentMethods/pm-1': { paymentMethodId: 'pm-1' },
      },
    )
    const a = new KillbillAdapter()
    const c = creds()
    expect((await a.getCustomer(c, 'acc-1')).id).toBe('acc-1')
    expect((await a.getCharge(c, 'pay-1')).id).toBe('pay-1')
    await expect(a.getCharge(c, 'pay-2')).rejects.toMatchObject({ statusCode: 404 })
    expect((await a.getSubscription(c, 's-1')).id).toBe('s-1')
    expect((await a.getPaymentMethod(c, 'pm-1')).id).toBe('pm-1')
    expect(f.reqs.every((r) => r.path.startsWith('/1.0/kb/'))).toBe(true)
  })
})
