import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 101,
    number: '101',
    status: 'processing',
    currency: 'USD',
    customer_id: 5,
    total: '49.99',
    subtotal: '44.99',
    total_tax: '5.00',
    discount_total: '0.00',
    shipping_total: '0.00',
    billing: {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+14155550100',
      address_1: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      postcode: '62701',
      country: 'US',
    },
    shipping: {
      address_1: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      postcode: '62701',
      country: 'US',
    },
    line_items: [
      {
        id: 201,
        name: 'Blue Widget',
        product_id: 10,
        variation_id: 0,
        quantity: 2,
        price: 19.99,
        total: '39.98',
        sku: 'BW-001',
      },
    ],
    coupon_lines: [{ id: 1, code: 'SAVE10' }],
    date_created_gmt: '2024-03-01T10:00:00Z',
    date_modified_gmt: '2024-03-01T11:00:00Z',
    date_paid_gmt: '2024-03-01T10:05:00Z',
    ...overrides,
  }
}

describe('transformOrder (Yampi/WooCommerce)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('101')
    expect(result.orderNumber).toBe('101')
    expect(result.name).toBe('#101')
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('5')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550100')
  })

  it('converts money fields from major to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 4499, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps WC status "processing" to PAID/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps WC status "completed" to PAID/FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps WC status "pending" to PENDING/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps WC status "on-hold" to PENDING/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'on-hold' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps WC status "cancelled" to VOIDED/UNFULFILLED and sets cancelledAt', () => {
    const result = transformOrder(
      makeOrder({ status: 'cancelled', date_modified_gmt: '2024-03-02T00:00:00Z' }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-03-02T00:00:00Z')
  })

  it('maps WC status "refunded" to REFUNDED/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps WC status "failed" to VOIDED/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'failed' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('defaults currency to USD when absent', () => {
    const result = transformOrder(makeOrder({ currency: undefined }))
    expect(result.currency).toBe('USD')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('201')
    expect(li.title).toBe('Blue Widget')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(li.sku).toBe('BW-001')
    expect(li.productId).toBe('10')
  })

  it('maps discount codes from coupon_lines', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T11:00:00Z')
    expect(result.processedAt).toMatch(/^2024-03-01T10:05:00/)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('untransformOrder (Yampi/WooCommerce)', () => {
  it('maps billing address fields back to WC shape', () => {
    const result = untransformOrder({
      currency: 'USD',
      note: 'please hurry',
      customerId: '5',
      billingAddress: {
        line1: '1 Main St',
        city: 'Springfield',
        postalCode: '62701',
        country: 'US',
      },
      email: 'jane@example.com',
    })
    expect(result.currency).toBe('USD')
    expect(result.customer_note).toBe('please hurry')
    expect((result.billing as Record<string, unknown>)['address_1']).toBe('1 Main St')
  })

  it('omits billing when no billingAddress provided', () => {
    const result = untransformOrder({ currency: 'USD' })
    expect(result.billing).toBeUndefined()
  })
})
