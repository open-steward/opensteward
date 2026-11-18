import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopwareRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawShopwareRefund> = {}): RawShopwareRefund {
  return {
    id: 'refund-abc123',
    captureId: 'capture-001',
    orderId: 'order-001',
    amount: { totalPrice: 29.99 },
    stateMachineState: { technicalName: 'completed', name: 'Completed' },
    positions: [
      {
        id: 'rpos-1',
        orderLineItemId: 'li-1',
        quantity: 1,
        amount: { totalPrice: 29.99 },
        reason: 'Defective item',
      },
    ],
    reason: 'Customer returned defective item',
    createdAt: '2024-06-01T10:00:00+00:00',
    updatedAt: '2024-06-01T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformRefund (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('refund-abc123')
    expect(result.orderId).toBe('order-001')
    expect(result.amount).toEqual({ amount: 2999, currency: 'EUR' })
    expect(result.reason).toBe('Customer returned defective item')
  })

  it('maps refund line items', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('li-1')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('handles missing positions', () => {
    const result = transformRefund(makeRefund({ positions: undefined }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('uses provided currency', () => {
    const result = transformRefund(makeRefund(), 'USD')
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves raw payload in metadata and validates', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Shopware)', () => {
  it('maps canonical fields', () => {
    const body = untransformRefund({
      amount: { amount: 15.0, currency: 'EUR' },
      refundLineItems: [{ lineItemId: 'li-1', quantity: 1, amount: { amount: 15.0, currency: 'EUR' } }],
    })
    const amount = body['amount'] as Record<string, unknown>
    expect(amount['totalPrice']).toBe(15.0)
    const positions = body['positions'] as Array<Record<string, unknown>>
    expect(positions).toHaveLength(1)
    expect(positions[0]!['orderLineItemId']).toBe('li-1')
  })
})
