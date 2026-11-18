/**
 * Openpay list methods, paged the way the router and the sync worker ask.
 *
 * Every Openpay endpoint is /v1/{MERCHANT_ID}/<resource> ("Un endpoint completo
 * esta formado por la URI base del ambiente, el identificador del comercio y el
 * recurso.", https://documents.openpay.mx/docs/api/index.html). Lists answer a
 * bare array and page by `offset` ("Número de registros a omitir al inicio, por
 * defecto 0.") and `limit` ("Número de registros que se requieren, por defecto
 * 10."), with no documented maximum and no total, so a short page is the end.
 *
 * The adapter used to call /v1/<resource> with no merchant id, send `{ limit }`
 * alone, read `res.data` off the array (always []), call /transfers for payouts
 * and a fabricated /refunds for refunds.
 *
 * The fake honours only `offset` and `limit`, and only under the merchant base.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { OpenpayAdapter } from '../../../../../../src/verticals/payments/adapters/openpay'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/openpay/constants'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock, ctorMock } = vi.hoisted(() => ({ getMock: vi.fn(), ctorMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/openpay/client', () => ({
  OpenpayClient: class {
    constructor(_c: unknown, merchantId: string) {
      ctorMock(merchantId)
    }
    get = getMock
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new OpenpayAdapter()
const routed: PaymentsAdapter = adapter
const MERCHANT = 'mzdtln0bmtms6o3kck8f'
const CREDS: Credentials = { accessToken: 'c2tfdGVzdDo=', extra: { merchantId: MERCHANT } }
const DOCUMENTED = new Set(['offset', 'limit'])

function row(path: string, i: number): Record<string, unknown> {
  const id = `r${i}`
  if (path === '/customers') return { id, name: 'N', creation_date: '2013-11-08T12:04:46-06:00' }
  if (path === '/plans')
    return {
      id,
      name: 'P',
      status: 'active',
      amount: 150,
      currency: 'MXN',
      repeat_every: 1,
      repeat_unit: 'month',
    }
  return {
    id,
    amount: 10.5,
    currency: 'MXN',
    status: 'completed',
    creation_date: '2014-05-26T17:23:03-05:00',
  }
}

/** A collection of `total` rows served by offset/limit only. */
function serve(path: string, total: number) {
  getMock.mockImplementation(async (p: string, q: Record<string, unknown>) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    for (const k of Object.keys(q)) if (!DOCUMENTED.has(k)) throw new Error(`undocumented ${k}`)
    const offset = Number(q.offset ?? 0)
    const limit = Number(q.limit ?? 10)
    const all = Array.from({ length: total }, (_, i) => row(path, i + 1))
    return all.slice(offset, offset + limit)
  })
}

type M = 'listCustomers' | 'listCharges' | 'listPayouts' | 'listPlans'
const METHODS: [M, string][] = [
  ['listCustomers', '/customers'],
  ['listCharges', '/charges'],
  ['listPayouts', '/payouts'],
  ['listPlans', '/plans'],
]

beforeEach(() => {
  getMock.mockReset()
  ctorMock.mockReset()
})

describe.each(METHODS)('openpay %s', (method, path) => {
  it('walks N = 2L+1 rows once each, with an exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await routed[method]!(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `r${i + 1}`))
    expect(more).toEqual([true, true, false])
    expect(getMock.mock.calls.map((c) => c[1])).toEqual([
      { offset: 0, limit: 3 },
      { offset: 3, limit: 3 },
      { offset: 6, limit: 3 },
    ])
    expect(ctorMock).toHaveBeenCalledWith(MERCHANT)
  })

  it('refuses a non-array response instead of reading it as empty', async () => {
    getMock.mockResolvedValue({ data: [] })
    await expect(routed[method]!(CREDS, { page: 1, limit: 10 } as QueryParams)).rejects.toThrow(
      /documented array/,
    )
  })

  it('refuses with 501 before any request when the connection has no merchant id', async () => {
    await expect(
      routed[method]!({ accessToken: 'x' }, { page: 1, limit: 10 } as QueryParams),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('openpay get methods read the bare object under the merchant base', () => {
  it.each([
    ['getCustomer', '/customers/c%2F1'],
    ['getCharge', '/charges/c%2F1'],
    ['getPayout', '/payouts/c%2F1'],
    ['getPlan', '/plans/c%2F1'],
  ] as const)('%s → %s', async (method, path) => {
    const base = path.split('/')[1]!
    getMock.mockResolvedValue({ ...row(`/${base}`, 1), id: 'c/1' })
    const r = await routed[method]!(CREDS, 'c/1')
    expect(getMock).toHaveBeenCalledWith(path)
    expect(r.id).toBe('c/1')
  })
})

describe('openpay customer-scoped lists page by offset too', () => {
  it.each([
    ['listPaymentMethods', '/customers/cus1/cards'],
    ['listSubscriptions', '/customers/cus1/subscriptions'],
  ] as const)('%s sends offset/limit to %s', async (method, path) => {
    getMock.mockResolvedValue([])
    const params = withPageSink({ page: 2, limit: 5, customerId: 'cus1' } as QueryParams)
    await routed[method]!(CREDS, params)
    expect(getMock).toHaveBeenCalledWith(path, { offset: 5, limit: 5 })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('openpay page size', () => {
  it('sends DEFAULT_PAGE_SIZE when the caller names no limit', async () => {
    getMock.mockResolvedValue([])
    await routed.listCharges!(CREDS, withPageSink({ page: 2 } as QueryParams))
    expect(getMock).toHaveBeenCalledWith('/charges', {
      offset: DEFAULT_PAGE_SIZE,
      limit: DEFAULT_PAGE_SIZE,
    })
  })
})

describe('openpay customer-scoped get methods read back a listed id', () => {
  it('getPaymentMethod reads /customers/{c}/cards/{id}, URL-encoded', async () => {
    getMock.mockResolvedValue({ id: 'k/1', brand: 'visa' })
    const r = await routed.getPaymentMethod!(CREDS, 'cus/1:k/1')
    expect(getMock).toHaveBeenCalledWith('/customers/cus%2F1/cards/k%2F1')
    expect(r.id).toBe('cus/1:k/1')
  })

  it('getSubscription reads /customers/{c}/subscriptions/{id}, URL-encoded', async () => {
    getMock.mockResolvedValue({ id: 's/1', status: 'active' })
    const r = await routed.getSubscription!(CREDS, 'cus/1:s/1')
    expect(getMock).toHaveBeenCalledWith('/customers/cus%2F1/subscriptions/s%2F1')
    expect(r.id).toBe('cus/1:s/1')
  })

  it('list ids are the ids get accepts', async () => {
    getMock.mockResolvedValue([{ id: 'k1' }])
    const cards = await routed.listPaymentMethods!(CREDS, {
      page: 1,
      limit: 5,
      customerId: 'cus1',
    } as QueryParams)
    expect(cards.map((c) => c.id)).toEqual(['cus1:k1'])
    getMock.mockResolvedValue([{ id: 's1', status: 'active' }])
    const subs = await routed.listSubscriptions!(CREDS, {
      page: 1,
      limit: 5,
      customerId: 'cus1',
    } as QueryParams)
    expect(subs.map((s) => s.id)).toEqual(['cus1:s1'])
  })

  it('throws instead of mapping an empty get response to a blank record', async () => {
    getMock.mockResolvedValue({})
    await expect(routed.getPaymentMethod!(CREDS, 'cus1:k1')).rejects.toThrow(/no id/)
    await expect(routed.getSubscription!(CREDS, 'cus1:s1')).rejects.toThrow(/no id/)
  })
})

describe('openpay listRefunds', () => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      routed.listRefunds!(CREDS, { page: 1, limit: 10 } as QueryParams),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(ctorMock).not.toHaveBeenCalled()
  })
})

describe('openpay credentials', () => {
  it('collects the merchant id and keeps it on the connection', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['merchantId', 'apiKey'])
    const c = await adapter.exchangeCredentials({ merchantId: MERCHANT, apiKey: 'sk_x' })
    expect(c.extra).toEqual({ merchantId: MERCHANT })
    expect(Buffer.from(c.accessToken, 'base64').toString()).toBe('sk_x:')
    await expect(adapter.exchangeCredentials({ apiKey: 'sk_x' })).rejects.toThrow(/Merchant ID/)
  })
})
