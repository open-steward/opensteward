import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSkioOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/skio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSkioOrder> = {}): RawSkioOrder {
  return {
    id: 'skio-order-001',
    platformId: 'gid://shopify/Order/12345',
    platformNumber: '1042',
    storefrontUserId: 'user-001',
    StorefrontUser: { id: 'user-001', email: 'ada@example.com' },
    currency: 'USD',
    totalPrice: '108.24',
    subtotalPrice: '100.00',
    totalTax: '8.25',
    totalDiscounts: '5.00',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    OrderLineItems: [
      {
        id: 'li-001',
        productPlatformId: 'gid://shopify/Product/987654321',
        productVariantPlatformId: 'gid://shopify/ProductVariant/111',
        title: 'Ocean Blue T-Shirt',
        quantity: 2,
        price: '49.99',
        sku: 'TEE-L-BLUE',
      },
    ],
    ShippingLines: [{ id: 'sl-001', price: '4.99', title: 'Standard' }],
    shippingAddress: {
      address1: '1 Computing Lane',
      city: 'London',
      zip: 'EC1A 1BB',
      countryCode: 'GB',
    },
    billingAddress: {
      address1: '1 Computing Lane',
      city: 'London',
      zip: 'EC1A 1BB',
      countryCode: 'GB',
    },
    discountCodes: [{ code: 'SAVE5' }],
    note: 'Gift wrap please',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-01T12:00:00Z',
    processedAt: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('skio-order-001')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.currency).toBe('USD')
    expect(result.email).toBe('ada@example.com')
    expect(result.customerId).toBe('user-001')
  })

  it('converts money amounts from major to minor units', () => {
    const result = transformOrder(makeOrder())
    // 108.24 USD → 10824 cents
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    // 100.00 → 10000
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'USD' })
    // 8.25 → 825
    expect(result.totalTax).toEqual({ amount: 825, currency: 'USD' })
    // 5.00 → 500
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('sums ShippingLines for totalShipping', () => {
    const result = transformOrder(makeOrder())
    // 4.99 USD → 499 cents
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('gid://shopify/Product/987654321')
    expect(li.variantId).toBe('gid://shopify/ProductVariant/111')
    expect(li.title).toBe('Ocean Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-L-BLUE')
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('1 Computing Lane')
    expect(result.shippingAddress?.city).toBe('London')
    expect(result.shippingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.shippingAddress?.country).toBe('GB')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('maps discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
  })

  it('maps note and timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Gift wrap please')
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T12:00:00.000Z')
    expect(result.processedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('falls back to storefrontUserId when StorefrontUser has no id', () => {
    const result = transformOrder(makeOrder({ StorefrontUser: null }))
    expect(result.customerId).toBe('user-001')
  })

  it('maps platformNumber as number correctly', () => {
    const result = transformOrder(makeOrder({ platformNumber: 2000 }))
    expect(result.orderNumber).toBe('2000')
    expect(result.name).toBe('#2000')
  })

  it('maps pending financial status', () => {
    const result = transformOrder(makeOrder({ financialStatus: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps unfulfilled fulfillment status', () => {
    const result = transformOrder(makeOrder({ fulfillmentStatus: 'unfulfilled' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('returns undefined totalShipping when no ShippingLines', () => {
    const result = transformOrder(makeOrder({ ShippingLines: [] }))
    expect(result.totalShipping).toBeUndefined()
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
})
