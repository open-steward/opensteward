import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSquareOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSquareOrder> = {}): RawSquareOrder {
  return {
    id: 'ORDER_001',
    location_id: 'LOC_MAIN',
    reference_id: 'REF-1001',
    customer_id: 'CUST_001',
    state: 'COMPLETED',
    total_money: { amount: 1500, currency: 'USD' },
    total_tax_money: { amount: 124, currency: 'USD' },
    total_discount_money: { amount: 100, currency: 'USD' },
    line_items: [
      {
        uid: 'LI_001',
        catalog_object_id: 'VAR_001',
        name: 'Espresso',
        quantity: '2',
        base_price_money: { amount: 350, currency: 'USD' },
        total_discount_money: { amount: 50, currency: 'USD' },
      },
    ],
    tenders: [
      { id: 'TENDER_001', payment_id: 'PAY_001', amount_money: { amount: 1500, currency: 'USD' } },
    ],
    fulfillments: [{ uid: 'FUL_001', state: 'COMPLETED' }],
    refunds: [{ id: 'REFUND_001' }],
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Square)', () => {
  it('maps core fields with money conversion', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORDER_001')
    expect(result.orderNumber).toBe('REF-1001')
    expect(result.customerId).toBe('CUST_001')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 1500, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 124, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 100, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LI_001')
    expect(li.variantId).toBe('VAR_001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 350, currency: 'USD' })
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps tender payment ids and refund ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.transactionIds).toEqual(['PAY_001'])
    expect(result.refundIds).toEqual(['REFUND_001'])
    expect(result.fulfillmentIds).toEqual(['FUL_001'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED state', () => {
    const result = transformOrder(makeOrder({ state: 'CANCELED' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical, 'LOC_MAIN')
    expect(raw['location_id']).toBe('LOC_MAIN')
    expect(raw['customer_id']).toBe('CUST_001')
  })
})
