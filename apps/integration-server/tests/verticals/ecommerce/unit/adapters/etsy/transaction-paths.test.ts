/**
 * Pins the requests behind ecommerce/etsy:transaction.
 *
 * Before this, listTransactions/getTransaction did not exist on the Etsy
 * adapter at all — the router returned 501 for both, and metadata.ts
 * declared `transaction` unavailable. Per the Etsy Open API v3 Payments API:
 *
 *   listTransactions requires `orderId` (no shop-wide payment list exists):
 *                     GET /shops/{shop_id}/receipts/{receipt_id}/payments
 *   getTransaction    GET /shops/{shop_id}/payments?payment_ids={id}
 *                     (shop-wide fetch-by-known-id; no receipt context needed)
 *
 * Each Payment result maps to one SALE transaction plus one REFUND
 * transaction per `payment_adjustments[]` entry.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { EtsyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/etsy/index'
import { TransactionSchema } from '../../../../../../src/verticals/ecommerce/schema/transaction'

const CREDS = { accessToken: 'tok', extra: { apiKeyString: 'key123', shopId: 'shop1' } }

interface Call {
  method: 'get'
  path: string
  params?: Record<string, unknown>
}

function fakeHttp(handlers: {
  get?: (path: string, params?: Record<string, unknown>) => unknown
}) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ method: 'get', path, params: cfg?.params })
    return { data: handlers.get ? handlers.get(path, cfg?.params) : {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const PAYMENT = {
  payment_id: 555111,
  receipt_id: 999,
  amount_gross: { amount: 3498, divisor: 100, currency_code: 'USD' },
  currency: 'USD',
  status: 'settled',
  created_timestamp: 1714564800,
  payment_adjustments: [
    {
      payment_adjustment_id: 777222,
      payment_id: 555111,
      is_success: true,
      total_adjustment_amount: { amount: 1000, divisor: 100, currency_code: 'USD' },
      created_timestamp: 1714651200,
    },
  ],
}

describe('listTransactions', () => {
  it('rejects with a 400 when orderId is missing, and makes no request', async () => {
    const { calls } = fakeHttp({})
    await expect(new EtsyAdapter().listTransactions(CREDS, {} as never)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toHaveLength(0)
  })

  it('GETs /shops/{shop_id}/receipts/{orderId}/payments — not a shop-wide payment list', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/receipts/999/payments') return { count: 1, results: [PAYMENT] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const out = await new EtsyAdapter().listTransactions(CREDS, { orderId: '999' } as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/shops/shop1/receipts/999/payments')
    expect(out).toHaveLength(2)
    for (const t of out) {
      expect(() => TransactionSchema.parse(t)).not.toThrow()
    }
  })

  it('accepts snake_case order_id too', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/receipts/999/payments') return { count: 1, results: [PAYMENT] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await new EtsyAdapter().listTransactions(CREDS, { order_id: '999' } as never)
    expect(calls[0]!.path).toBe('/shops/shop1/receipts/999/payments')
  })

  it('maps the Payment to SALE and each payment_adjustments[] entry to REFUND', async () => {
    fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/receipts/999/payments') return { count: 1, results: [PAYMENT] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const out = await new EtsyAdapter().listTransactions(CREDS, { orderId: '999' } as never)
    expect(out[0]).toMatchObject({ id: '555111', kind: 'SALE' })
    expect(out[1]).toMatchObject({ id: '777222', kind: 'REFUND', parentTransactionId: '555111' })
  })

  it('returns [] when the receipt has no payments, without throwing', async () => {
    fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/receipts/999/payments') return { count: 0, results: [] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const out = await new EtsyAdapter().listTransactions(CREDS, { orderId: '999' } as never)
    expect(out).toEqual([])
  })
})

describe('getTransaction', () => {
  it('GETs /shops/{shop_id}/payments with payment_ids=id — shop-wide, no receipt in the path', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/payments') return { count: 1, results: [PAYMENT] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const t = await new EtsyAdapter().getTransaction(CREDS, '555111')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/shops/shop1/payments')
    expect(calls[0]!.params).toMatchObject({ payment_ids: '555111' })
    expect(t).toMatchObject({ id: '555111', kind: 'SALE' })
    expect(() => TransactionSchema.parse(t)).not.toThrow()
  })

  it('resolves a REFUND transaction nested in the fetched Payment', async () => {
    fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/payments') return { count: 1, results: [PAYMENT] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const t = await new EtsyAdapter().getTransaction(CREDS, '777222')
    expect(t).toMatchObject({ id: '777222', kind: 'REFUND', parentTransactionId: '555111' })
  })

  it('rejects with a 404 when no payment matches the id', async () => {
    fakeHttp({
      get: (path) => {
        if (path === '/shops/shop1/payments') return { count: 0, results: [] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await expect(new EtsyAdapter().getTransaction(CREDS, 'does-not-exist')).rejects.toMatchObject(
      { statusCode: 404 },
    )
  })
})
