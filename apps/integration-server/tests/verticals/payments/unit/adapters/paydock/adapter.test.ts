/**
 * Paydock requests, get-by-id envelopes, refusals and the payment-source walk.
 *
 * Paydock's API reference (https://documenter.getpostman.com/view/6912944/Uyr5my5q):
 *   - every server-side request sends header `x-user-secret-key` ("This is
 *     your PayDock API Secret Key");
 *   - responses are `{ status, error, resource: { type, data, ... } }`;
 *   - customers/search (GET /v1/customers) takes `skip` / `limit` and answers
 *     with `resource.count`; each customer carries `payment_sources[]` and
 *     `default_source`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type Credentials } from '@opensteward/shared'
import { PaydockAdapter } from '../../../../../../src/verticals/payments/adapters/paydock/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'
import { PaymentMethodSchema } from '../../../../../../src/verticals/payments/schema/payment-method'
import { SubscriptionSchema } from '../../../../../../src/verticals/payments/schema/subscription'
import { DOC_CHARGE, DOC_CUSTOMER, DOC_REFUND_CHARGE, DOC_SUBSCRIPTION } from './fixtures/docs'

type Handler = (path: string, params: Record<string, unknown>) => unknown

function fake(handler: Handler) {
  const created: Array<Record<string, unknown>> = []
  const sent: Array<{ path: string; params: Record<string, unknown> }> = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    sent.push({ path, params })
    return { data: handler(path, params) }
  })
  const post = vi.fn(async () => ({ data: {} }))
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Record<string, unknown>) => {
    created.push(cfg)
    return { get, post }
  }) as never)
  return { created, sent, get, post }
}

let n = 0
/** A fresh connection per test, so the row pager's memo never crosses tests. */
function creds(): Credentials {
  n += 1
  return { accessToken: `sk_paydock_${n}` }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Paydock client', () => {
  it('sends the secret key in x-user-secret-key and no Authorization header', async () => {
    const f = fake(() => ({
      status: 200,
      error: null,
      resource: { type: 'customers', data: [], count: 0 },
    }))
    const c = creds()
    await new PaydockAdapter().listCustomers(c, withPageSink({ page: 1, limit: 10 }))
    const headers = f.created[0]!['headers'] as Record<string, string>
    expect(headers['x-user-secret-key']).toBe(c.accessToken)
    expect(headers['Authorization']).toBeUndefined()
    expect(f.created[0]!['baseURL']).toBe('https://api.paydock.com/v1')
  })
})

describe('Paydock get-by-id reads resource.data', () => {
  const cases = [
    { method: 'getCustomer', path: '/customers/', data: DOC_CUSTOMER, schema: CustomerSchema },
    { method: 'getCharge', path: '/charges/', data: DOC_CHARGE, schema: ChargeSchema },
    {
      method: 'getSubscription',
      path: '/subscriptions/',
      data: DOC_SUBSCRIPTION,
      schema: SubscriptionSchema,
    },
  ] as const

  for (const c of cases) {
    it(`${c.method} unwraps resource.data from ${c.path}:id`, async () => {
      const f = fake(() => ({ status: 200, error: null, resource: { type: 'x', data: c.data } }))
      const out = await (
        new PaydockAdapter()[c.method] as (cr: Credentials, id: string) => Promise<unknown>
      )(creds(), c.data._id)
      expect(f.sent).toEqual([{ path: `${c.path}${c.data._id}`, params: {} }])
      const parsed = c.schema.parse(out) as { id: string }
      expect(parsed.id).toBe(c.data._id)
    })

    it(`${c.method} throws when resource.data is absent`, async () => {
      fake(() => ({ status: 200, error: null, data: c.data }))
      await expect(
        (new PaydockAdapter()[c.method] as (cr: Credentials, id: string) => Promise<unknown>)(
          creds(),
          'abc',
        ),
      ).rejects.toThrow(/resource\.data/)
    })
  }
})

describe('Paydock refusals send no request', () => {
  const refused = [
    'listBalanceTransactions',
    'getBalanceTransaction',
    'listDisputes',
    'getDispute',
    'listInvoices',
    'getInvoice',
    'listPayouts',
    'getPayout',
    'listPlans',
    'getPlan',
  ] as const
  for (const m of refused) {
    it(`${m} throws 501 NOT_SUPPORTED`, async () => {
      const f = fake(() => {
        throw new Error('no request expected')
      })
      const call = (new PaydockAdapter()[m] as (c: Credentials, p: unknown) => Promise<unknown>)(
        creds(),
        m.startsWith('list') ? withPageSink({ page: 1, limit: 10 }) : 'id_1',
      )
      await expect(call).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(f.get).not.toHaveBeenCalled()
      expect(f.post).not.toHaveBeenCalled()
      expect(f.created).toHaveLength(0)
    })
  }
})

/**
 * `customers` customers with an uneven number of payment sources each
 * (0, 1, 2, 3, ...), plus one archived source on every fifth customer. The
 * fake honours only the documented `skip` (default 0) and `limit` (default
 * 100, maximum 1000).
 */
function customerStore(customers: number) {
  const all = Array.from({ length: customers }, (_, i) => {
    const cid = `c${String(i).padStart(4, '0')}`
    const k = i % 4
    const sources: Array<Record<string, unknown>> = Array.from({ length: k }, (_, j) => ({
      _id: `${cid}_ps${j}`,
      type: 'card',
      card_scheme: 'visa',
      card_number_last4: '4242',
      expire_month: 5,
      expire_year: 2030,
      status: 'active',
    }))
    if (i % 5 === 0) sources.push({ _id: `${cid}_gone`, type: 'card', status: 'archived' })
    return { _id: cid, default_source: k > 0 ? `${cid}_ps0` : undefined, payment_sources: sources }
  })
  const expected = all.flatMap((c) =>
    c.payment_sources.filter((s) => s['status'] !== 'archived').map((s) => String(s['_id'])),
  )
  return { all, expected }
}

function customersHandler(
  all: Array<Record<string, unknown>>,
  opts: { omitCount?: boolean; path?: string } = {},
): Handler {
  return (path, q) => {
    if (path !== (opts.path ?? '/customers'))
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    const limit = q['limit'] === undefined ? 100 : Number(q['limit'])
    const skip = q['skip'] === undefined ? 0 : Number(q['skip'])
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error(`400 limit ${String(q['limit'])}`)
    if (!Number.isInteger(skip) || skip < 0) throw new Error(`400 skip ${String(q['skip'])}`)
    const data = all.slice(skip, skip + limit)
    return {
      status: 200,
      error: null,
      resource: opts.omitCount
        ? { type: 'customers', data, limit, skip }
        : { type: 'customers', data, count: all.length, limit, skip },
    }
  }
}

describe('Paydock listPaymentMethods walks customers/search', () => {
  it('serves 2L+1 payment sources over three pages, each once, hasMore exact', async () => {
    // 3 customers with 0,1,2 sources = 3 sources: L = 1, N = 3.
    const { all, expected } = customerStore(3)
    expect(expected).toHaveLength(3)
    const f = fake(customersHandler(all))
    const a = new PaydockAdapter()
    const c = creds()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 1 })
      const items = await a.listPaymentMethods(c, params)
      items.forEach((i) => PaymentMethodSchema.parse(i))
      ids.push(...items.map((i) => i.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(expected)
    expect(more).toEqual([true, true, false])
    expect(f.sent.every((s) => s.path === '/customers' && s.params['limit'] === 100)).toBe(true)
    expect(f.sent.every((s) => s.params['sortkey'] === 'created_at')).toBe(true)
    expect(f.sent.every((s) => s.params['sortdirection'] === 'ASC')).toBe(true)
  })

  it('ends when a page comes back empty although count says more', async () => {
    const f = fake(() => ({
      status: 200,
      error: null,
      resource: { type: 'customers', data: [], count: 500 },
    }))
    const params = withPageSink({ page: 1, limit: 10 })
    const items = await new PaydockAdapter().listPaymentMethods(creds(), params)
    expect(items).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(f.sent).toHaveLength(1)
  })

  it('throws on a customer row without _id instead of inventing an owner', async () => {
    fake(customersHandler([{ payment_sources: [{ _id: 'ps1', type: 'card' }] }]))
    await expect(
      new PaydockAdapter().listPaymentMethods(creds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/_id/)
  })

  it('crosses uneven upstream pages of 100 customers (N = 2L+1)', async () => {
    const { all, expected } = customerStore(250)
    // Make the total odd, then L = (N-1)/2.
    let exp = expected
    if (exp.length % 2 === 0) {
      all[1]!.payment_sources.pop()
      exp = expected.filter((id) => id !== 'c0001_ps0')
    }
    const N = exp.length
    const L = (N - 1) / 2
    const f = fake(customersHandler(all))
    const a = new PaydockAdapter()
    const c = creds()
    const pages = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const items = await a.listPaymentMethods(c, params)
      pages.push({ ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore })
    }
    expect(pages.flatMap((p) => p.ids)).toEqual(exp)
    expect(new Set(pages.flatMap((p) => p.ids)).size).toBe(N)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages[2]!.ids).toHaveLength(1)
    expect(f.sent.map((s) => s.params['skip'])).toEqual(expect.arrayContaining([0, 100, 200]))
    expect(f.sent.every((s) => s.params['limit'] === 100)).toBe(true)
  })

  it('skips archived sources and marks the default_source', async () => {
    const { all } = customerStore(6)
    fake(customersHandler(all))
    const items = await new PaydockAdapter().listPaymentMethods(
      creds(),
      withPageSink({ page: 1, limit: 50 }),
    )
    expect(items.some((i) => i.id.endsWith('_gone'))).toBe(false)
    const first = items.find((i) => i.id === 'c0001_ps0')!
    expect(first.customerId).toBe('c0001')
    expect(first.isDefault).toBe(true)
    expect(items.find((i) => i.id === 'c0002_ps1')!.isDefault).toBe(false)
  })

  it('ends on a short page when resource.count is absent', async () => {
    const { all, expected } = customerStore(150)
    fake(customersHandler(all, { omitCount: true }))
    const params = withPageSink({ page: 1, limit: expected.length + 5 })
    const items = await new PaydockAdapter().listPaymentMethods(creds(), params)
    expect(items.map((i) => i.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('ends on resource.count without fetching past it when the last page is exactly full', async () => {
    const { all, expected } = customerStore(100)
    const f = fake(customersHandler(all))
    const params = withPageSink({ page: 1, limit: expected.length })
    const items = await new PaydockAdapter().listPaymentMethods(creds(), params)
    expect(items).toHaveLength(expected.length)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(f.sent).toHaveLength(1)
  })
})

describe('Paydock getPaymentMethod reads customers/search by payment_source_id', () => {
  it('sends only the documented filter and returns the matching source', async () => {
    const src = DOC_CUSTOMER.payment_sources[0]!
    const f = fake(() => ({
      status: 200,
      error: null,
      resource: {
        type: 'customers',
        data: [
          {
            ...DOC_CUSTOMER,
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            payment_sources: [{ ...src, _id: 'other' }],
          },
          DOC_CUSTOMER,
        ],
        count: 2,
      },
    }))
    const pm = PaymentMethodSchema.parse(
      await new PaydockAdapter().getPaymentMethod(creds(), src._id),
    )
    expect(f.sent).toEqual([{ path: '/customers', params: { payment_source_id: src._id } }])
    expect(pm.id).toBe(src._id)
    expect(pm.customerId).toBe(DOC_CUSTOMER._id)
    expect(pm.isDefault).toBe(true)
  })

  it('throws 404 when no customer holds the source', async () => {
    fake(() => ({ status: 200, error: null, resource: { type: 'customers', data: [], count: 0 } }))
    await expect(
      new PaydockAdapter().getPaymentMethod(creds(), 'ffffffffffffffffffffffff'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

/**
 * `charges` charges shaped like the documented refund example: one sale
 * transaction each plus `i % 3` refund transactions (0, 1, 2, ...).
 */
function chargeStore(charges: number) {
  const all = Array.from({ length: charges }, (_, i) => {
    const id = `ch${String(i).padStart(4, '0')}`
    const sale = { ...DOC_REFUND_CHARGE.transactions[0]!, _id: `${id}_sale` }
    // "capture A capture transaction …" from the Transaction types table: not a refund.
    const capture = { ...sale, _id: `${id}_cap`, type: 'capture' }
    const refunds = Array.from({ length: i % 3 }, (_, j) => ({
      ...DOC_REFUND_CHARGE.transactions[1]!,
      _id: `${id}_rf${j}`,
    }))
    return { ...DOC_REFUND_CHARGE, _id: id, transactions: [sale, capture, ...refunds] }
  })
  const expected = all.flatMap((c) =>
    c.transactions.filter((t) => t.type === 'refund').map((t) => t._id),
  )
  return { all, expected }
}

describe('Paydock listRefunds flattens refund transactions out of charges/search', () => {
  it('serves 2L+1 refunds over three pages, each once, hasMore exact', async () => {
    // 3 charges with 0,1,2 refunds = 3 refunds: L = 1, N = 3.
    const { all, expected } = chargeStore(3)
    expect(expected).toHaveLength(3)
    const f = fake(customersHandler(all, { path: '/charges' }))
    const a = new PaydockAdapter()
    const c = creds()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 1 })
      const items = await a.listRefunds(c, params)
      items.forEach((i) => RefundSchema.parse(i))
      ids.push(...items.map((i) => i.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(expected)
    expect(more).toEqual([true, true, false])
    expect(f.sent.every((s) => s.path === '/charges' && s.params['limit'] === 100)).toBe(true)
    expect(f.sent.every((s) => s.params['sortdirection'] === 'ASC')).toBe(true)
  })

  it('crosses uneven upstream pages of 100 charges (N = 2L+1) with the parent chargeId', async () => {
    const { all, expected } = chargeStore(251)
    let exp = expected
    if (exp.length % 2 === 0) {
      all[1]!.transactions.pop()
      exp = expected.filter((id) => id !== 'ch0001_rf0')
    }
    const N = exp.length
    const L = (N - 1) / 2
    const f = fake(customersHandler(all, { path: '/charges' }))
    const a = new PaydockAdapter()
    const c = creds()
    const pages = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const items = await a.listRefunds(c, params)
      pages.push({ items, hasMore: readUpstreamPage(params)?.hasMore })
    }
    const ids = pages.flatMap((p) => p.items.map((i) => i.id))
    expect(ids).toEqual(exp)
    expect(new Set(ids).size).toBe(N)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const one = pages.flatMap((p) => p.items).find((i) => i.id === 'ch0250_rf0')!
    expect(one.chargeId).toBe('ch0250')
    expect(f.sent.map((s) => s.params['skip'])).toEqual(expect.arrayContaining([0, 100, 200]))
  })
})
