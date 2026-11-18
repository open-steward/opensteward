import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawNopOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawNopOrder> = {}): RawNopOrder {
  return {
    id: 5001,
    custom_order_number: '1001',
    order_status: 'Processing',
    payment_status: 'Paid',
    shipping_status: 'NotYet',
    customer_id: 777,
    customer_email: 'alice@example.com',
    customer_currency_code: 'USD',
    billing_address: {
      first_name: 'Alice',
      last_name: 'Johnson',
      address1: '123 Main St',
      city: 'Springfield',
      state_province_name: 'IL',
      zip_postal_code: '62701',
      country: 'US',
      phone_number: '+1-555-0123',
    },
    shipping_address: {
      address1: '123 Main St',
      city: 'Springfield',
      state_province_name: 'IL',
      zip_postal_code: '62701',
      country: 'US',
    },
    order_subtotal_incl_tax: 49.98,
    order_tax: 4.50,
    order_discount: 5.0,
    order_shipping_incl_tax: 7.99,
    order_total: 57.47,
    order_items: [
      {
        id: 8001,
        product_id: 100,
        quantity: 2,
        unit_price_incl_tax: 24.99,
        discount_amount_incl_tax: 2.5,
        sku: 'TEE-OCEAN',
        attribute_description: 'Size: M, Color: Blue',
      },
    ],
    created_on_utc: '2024-03-01T14:00:00Z',
    updated_on_utc: '2024-03-02T10:00:00Z',
    paid_date_utc: '2024-03-01T14:05:00Z',
    ...overrides,
  }
}

describe('transformOrder (nopCommerce)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('777')
    expect(result.email).toBe('alice@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 450, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 799, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5747, currency: 'USD' })
  })

  it('maps payment_status → financialStatus', () => {
    expect(transformOrder(makeOrder({ payment_status: 'Paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ payment_status: 'Pending' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ payment_status: 'Refunded' })).financialStatus).toBe('REFUNDED')
    expect(transformOrder(makeOrder({ payment_status: 'Authorized' })).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ payment_status: 'Voided' })).financialStatus).toBe('VOIDED')
  })

  it('maps shipping_status → fulfillmentStatus', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'Shipped' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ shipping_status: 'NotYet' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ shipping_status: 'PartiallyShipped' })).fulfillmentStatus).toBe('PARTIAL')
  })

  it('falls back to order_status for fulfillment when no shipping_status', () => {
    const result = transformOrder(makeOrder({ shipping_status: undefined, order_status: 'Complete' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('8001')
    expect(li.productId).toBe('100')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(li.totalDiscount).toEqual({ amount: 250, currency: 'USD' })
    expect(li.sku).toBe('TEE-OCEAN')
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      line1: '123 Main St',
      line2: undefined,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(makeOrder({ order_status: 'Cancelled' }))
    expect(result.cancelledAt).toBe('2024-03-02T10:00:00Z')
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

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['customer_currency_code']).toBe('USD')
    expect(body['customer_id']).toBe('777')
    expect((body['billing_address'] as Record<string, unknown>)['address1']).toBe('123 Main St')
  })
})
