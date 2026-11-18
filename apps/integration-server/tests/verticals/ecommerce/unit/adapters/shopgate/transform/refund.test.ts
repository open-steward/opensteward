import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopgateReturnOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShopgateReturnOrder> = {}): RawShopgateReturnOrder {
  return {
    orderNumber: 'RO-2024-001',
    salesOrderNumber: 'SO-2024-001',
    status: 'processed',
    notes: 'Wrong size returned',
    currencyCode: 'USD',
    refundAmount: '19.99',
    lineItems: [
      {
        id: 'rli-001',
        quantity: 1,
        productCode: 'PROD-001',
        variantCode: 'VAR-S',
        unitRefundAmount: '19.99',
        currency: 'USD',
      },
    ],
    createdAt: '2024-04-10T14:00:00.000Z',
    processedAt: '2024-04-11T09:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformRefund', () => {
  it('maps orderNumber to id and salesOrderNumber to orderId', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('RO-2024-001')
    expect(result.orderId).toBe('SO-2024-001')
  })

  it('converts refundAmount to minor units (USD: ×100)', () => {
    // 19.99 USD = 1999 cents
    const result = transformRefund(makeRaw())
    expect(result.amount?.amount).toBe(1999)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps note from notes', () => {
    const result = transformRefund(makeRaw())
    expect(result.note).toBe('Wrong size returned')
  })

  it('maps refund line items with unitRefundAmount in minor units', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0].lineItemId).toBe('rli-001')
    expect(result.refundLineItems![0].quantity).toBe(1)
    expect(result.refundLineItems![0].amount?.amount).toBe(1999)
  })

  it('maps processedAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.processedAt).toBe('2024-04-11T09:00:00.000Z')
  })

  it('uses orderNumber as orderId when salesOrderNumber is absent', () => {
    const result = transformRefund(makeRaw({ salesOrderNumber: null }))
    expect(result.orderId).toBe('RO-2024-001')
  })

  it('produces output that passes RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRaw())
    const back = untransformRefund(canonical)
    expect(back.salesOrderNumber).toBe('SO-2024-001')
    expect(back.notes).toBe('Wrong size returned')
  })
})
