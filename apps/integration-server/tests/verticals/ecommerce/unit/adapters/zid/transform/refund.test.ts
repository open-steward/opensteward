import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/refund'
import type { RawZidOrder } from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/order'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeOrder(overrides: Partial<RawZidOrder> = {}): RawZidOrder {
  return {
    id: 8001,
    invoice_number: 1042,
    currency_code: 'SAR',
    order_status: { code: 'delivered', name: 'Delivered' },
    payment_status: 'refunded',
    order_total: '350.00',
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformRefund (Zid)', () => {
  it('synthesises id as refund:{orderId}', () => {
    const result = transformRefund(makeOrder())
    expect(result.id).toBe('refund:8001')
  })

  it('maps order id to orderId', () => {
    const result = transformRefund(makeOrder())
    expect(result.orderId).toBe('8001')
  })

  it('converts major-unit order_total to minor units for amount (SAR × 100)', () => {
    const result = transformRefund(makeOrder())
    // 350 SAR = 35000 halalas
    expect(result.amount).toEqual({ amount: 35000, currency: 'SAR' })
  })

  it('maps updated_at to processedAt and createdAt', () => {
    const result = transformRefund(makeOrder())
    expect(result.processedAt).toBe('2026-02-01T14:20:00Z')
    expect(result.createdAt).toBe('2026-02-01T14:20:00Z')
  })

  it('falls back to created_at for createdAt when updated_at is absent', () => {
    const result = transformRefund(makeOrder({ updated_at: undefined }))
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
  })

  it('leaves amount undefined when order_total is 0', () => {
    const result = transformRefund(makeOrder({ order_total: '0' }))
    expect(result.amount).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeOrder())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Zid)', () => {
  it('maps orderId to order_id', () => {
    const body = untransformRefund({ orderId: '8001' })
    expect(body.order_id).toBe('8001')
  })

  it('maps note', () => {
    const body = untransformRefund({ note: 'Customer changed mind' })
    expect(body.note).toBe('Customer changed mind')
  })
})
