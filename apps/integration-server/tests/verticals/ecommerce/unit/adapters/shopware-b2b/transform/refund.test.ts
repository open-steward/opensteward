import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopwareRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawShopwareRefund> = {}): RawShopwareRefund {
  return {
    id: 'refund-b2b-001',
    captureId: 'capture-001',
    orderId: 'order-b2b-001',
    amount: { totalPrice: 425.00 },
    reason: 'Damaged goods — 10 helmets returned',
    positions: [
      {
        id: 'rpos-1',
        orderLineItemId: 'li-1',
        quantity: 10,
        amount: { totalPrice: 425.00 },
      },
    ],
    createdAt: '2024-05-10T08:00:00+00:00',
    ...overrides,
  }
}

describe('transformRefund (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('refund-b2b-001')
    expect(result.orderId).toBe('order-b2b-001')
    expect(result.amount).toEqual({ amount: 425.00, currency: 'EUR' })
    expect(result.reason).toBe('Damaged goods — 10 helmets returned')
    expect(result.restock).toBe(false)
  })

  it('maps refund line items', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('li-1')
    expect(result.refundLineItems![0]!.quantity).toBe(10)
  })

  it('handles missing positions', () => {
    const result = transformRefund(makeRefund({ positions: undefined }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('handles missing orderId', () => {
    const result = transformRefund(makeRefund({ orderId: undefined }))
    expect(result.orderId).toBe('')
  })

  it('preserves metadata and validates', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Shopware B2B)', () => {
  it('maps canonical to Shopware shape', () => {
    const body = untransformRefund({
      amount: { amount: 100, currency: 'EUR' },
      refundLineItems: [
        { lineItemId: 'li-1', quantity: 5, amount: { amount: 100, currency: 'EUR' } },
      ],
    })
    const amount = body['amount'] as Record<string, unknown>
    expect(amount['totalPrice']).toBe(100)
    const positions = body['positions'] as Array<Record<string, unknown>>
    expect(positions).toHaveLength(1)
    expect(positions[0]!['orderLineItemId']).toBe('li-1')
  })
})
