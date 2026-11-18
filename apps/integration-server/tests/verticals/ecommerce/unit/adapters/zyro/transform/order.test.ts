import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawZyroOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/zyro/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawZyroOrder> = {}): RawZyroOrder {
  return {
    id: 'order-001',
    order_number: 1042,
    name: '#1042',
    customer_id: 'cust-007',
    email: 'ada@example.com',
    phone: '+44 20 7946 0958',
    currency: 'USD',
    subtotal_price: 49.98,
    total_tax: 4.50,
    total_discounts: 5.00,
    total_shipping: 6.99,
    total_price: 56.47,
    financial_status: 'paid',
    fulfillment_status: 'unfulfilled',
    line_items: [
      {
        id: 'li-001',
        product_id: 'prod-001',
        variant_id: 'var-001',
        title: 'Retro Camp Mug',
        quantity: 2,
        price: 14.99,
        total_discount: 0,
        sku: 'MUG-RED-SM',
        fulfillable_quantity: 2,
        fulfillment_status: 'unfulfilled',
        tax_lines: [
          { title: 'VAT', rate: 0.09, price: 2.70 },
        ],
      },
    ],
    billing_address: {
      address1: '10 Downing Street',
      city: 'London',
      province: 'England',
      zip: 'SW1A 2AA',
      country_code: 'GB',
    },
    shipping_address: {
      address1: '10 Downing Street',
      city: 'London',
      province: 'England',
      zip: 'SW1A 2AA',
      country_code: 'GB',
    },
    fulfillment_ids: ['ful-001'],
    discount_codes: ['SUMMER10'],
    tags: ['vip', 'repeat'],
    note: 'Please include gift card',
    created_at: '2024-04-01T09:00:00Z',
    updated_at: '2024-04-02T11:00:00Z',
    processed_at: '2024-04-01T09:05:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core identity fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-001')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.customerId).toBe('cust-007')
    expect(result.email).toBe('ada@example.com')
    expect(result.phone).toBe('+44 20 7946 0958')
    expect(result.currency).toBe('USD')
  })

  it('maps price summary fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 450, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 699, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5647, currency: 'USD' })
  })

  it('maps paid financial_status → PAID', () => {
    const result = transformOrder(makeOrder({ financial_status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps pending financial_status → PENDING', () => {
    const result = transformOrder(makeOrder({ financial_status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps refunded financial_status → REFUNDED', () => {
    const result = transformOrder(makeOrder({ financial_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps unfulfilled fulfillment_status → UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'unfulfilled' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps fulfilled fulfillment_status → FULFILLED', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'fulfilled' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps partial fulfillment_status → PARTIAL', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'partial' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('prod-001')
    expect(li.variantId).toBe('var-001')
    expect(li.title).toBe('Retro Camp Mug')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1499, currency: 'USD' })
    expect(li.sku).toBe('MUG-RED-SM')
  })

  it('maps tax lines on line items', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    expect(li.taxLines).toHaveLength(1)
    expect(li.taxLines![0]!.title).toBe('VAT')
    expect(li.taxLines![0]!.rate).toBe(0.09)
    expect(li.taxLines![0]!.amount).toEqual({ amount: 270, currency: 'USD' })
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('10 Downing Street')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('SW1A 2AA')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('10 Downing Street')
    expect(result.shippingAddress?.city).toBe('London')
  })

  it('maps fulfillment_ids, discount_codes and tags', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['ful-001'])
    expect(result.discountCodes).toEqual(['SUMMER10'])
    expect(result.tags).toEqual(['vip', 'repeat'])
  })

  it('maps note field', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please include gift card')
  })

  it('maps timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-04-01T09:00:00Z')
    expect(result.updatedAt).toBe('2024-04-02T11:00:00Z')
    expect(result.processedAt).toBe('2024-04-01T09:05:00Z')
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

  it('handles minimal order gracefully', () => {
    const result = transformOrder({ id: 'ord-min' })
    expect(result.id).toBe('ord-min')
    expect(result.currency).toBe('USD')
    expect(result.lineItems).toEqual([])
    expect(result.financialStatus).toBeUndefined()
    expect(result.fulfillmentStatus).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('falls back to payment_status when financial_status is absent', () => {
    const result = transformOrder(
      makeOrder({ financial_status: undefined, payment_status: 'authorized' }),
    )
    expect(result.financialStatus).toBe('AUTHORIZED')
  })

  it('uses shipping_price as fallback for total_shipping', () => {
    const result = transformOrder(
      makeOrder({ total_shipping: undefined, shipping_price: 3.99 }),
    )
    expect(result.totalShipping).toEqual({ amount: 399, currency: 'USD' })
  })

  it('maps cancelled order fields', () => {
    const result = transformOrder(
      makeOrder({
        cancelled_at: '2024-04-03T08:00:00Z',
        cancel_reason: 'customer_request',
      }),
    )
    expect(result.cancelledAt).toBe('2024-04-03T08:00:00Z')
    expect(result.cancelReason).toBe('customer_request')
  })
})
