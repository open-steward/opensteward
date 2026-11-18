import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWebflowOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWebflowOrder> = {}): RawWebflowOrder {
  return {
    orderId: 'ord_001',
    orderNumber: '1042',
    status: 'paid',
    comment: 'Please gift wrap',
    customerPaid: { value: 15000, unit: 'USD' },
    netAmount: { value: 12000, unit: 'USD' },
    totalTax: { value: 1500, unit: 'USD' },
    shippingTotal: { value: 1500, unit: 'USD' },
    customerInfo: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
    },
    billingAddress: {
      line1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country: 'GB',
    },
    shippingAddress: {
      line1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country: 'GB',
    },
    purchasedItems: [
      {
        productId: 'prod_abc123',
        productName: 'Designer Lamp',
        variantId: 'sku_001',
        variantName: 'Black',
        variantSku: 'LAMP-BLK',
        variantPrice: { value: 4999, unit: 'USD' },
        count: 3,
      },
    ],
    createdOn: '2024-05-01T10:00:00Z',
    lastUpdated: '2024-05-01T12:00:00Z',
    acceptedOn: '2024-05-01T10:01:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord_001')
    expect(result.orderNumber).toBe('1042')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.totalPrice).toEqual({ amount: 15000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 1500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.productId).toBe('prod_abc123')
    expect(li.variantId).toBe('sku_001')
    expect(li.title).toBe('Designer Lamp')
    expect(li.quantity).toBe(3)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('LAMP-BLK')
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('maps note from comment', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
  })

  it('maps unfulfilled status', () => {
    const result = transformOrder(makeOrder({ status: 'unfulfilled' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps refunded status', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
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

  it('round-trips note via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.comment).toBe('Please gift wrap')
  })
})
