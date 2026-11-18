import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSquarespaceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/squarespace/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSquarespaceOrder> = {}): RawSquarespaceOrder {
  return {
    id: 'order-abc-123',
    orderNumber: '1001',
    customerEmail: 'ada@example.com',
    createdOn: '2024-05-01T10:00:00Z',
    modifiedOn: '2024-05-01T12:00:00Z',
    fulfillmentStatus: 'PENDING',
    subtotal: { value: '10000', currency: 'USD' },
    taxTotal: { value: '825', currency: 'USD' },
    discountTotal: { value: '500', currency: 'USD' },
    shippingTotal: { value: '499', currency: 'USD' },
    refundedTotal: { value: '0', currency: 'USD' },
    grandTotal: { value: '10824', currency: 'USD' },
    lineItems: [
      {
        id: 'li-001',
        productId: 'prod-abc-123',
        variantId: 'var-001',
        productName: 'Organic Cotton T-Shirt',
        sku: 'TEE-S-WHITE',
        quantity: 2,
        unitPricePaid: { value: '2499', currency: 'USD' },
      },
    ],
    billingAddress: {
      address1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      countryCode: 'GB',
      state: 'England',
    },
    shippingAddress: {
      address1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      countryCode: 'GB',
      state: 'England',
    },
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-abc-123')
    expect(result.orderNumber).toBe('1001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.financialStatus).toBe('PAID')
  })

  it('converts money fields from cents', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 825, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('prod-abc-123')
    expect(li.variantId).toBe('var-001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('1 Programming Ln')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('derives REFUNDED financial status when fully refunded', () => {
    const result = transformOrder(
      makeOrder({ refundedTotal: { value: '10824', currency: 'USD' } }),
    )
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('derives PARTIALLY_REFUNDED when partially refunded', () => {
    const result = transformOrder(
      makeOrder({ refundedTotal: { value: '500', currency: 'USD' } }),
    )
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('maps FULFILLED fulfillment status', () => {
    const result = transformOrder(makeOrder({ fulfillmentStatus: 'FULFILLED' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
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

  it('round-trips fulfillment status via untransformOrder', () => {
    const raw = untransformOrder({ fulfillmentStatus: 'FULFILLED' })
    expect(raw.fulfillmentStatus).toBe('FULFILLED')
  })
})
