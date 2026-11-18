import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCLOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCLOrder> = {}): RawCLOrder {
  return {
    id: 'order-001',
    number: 1042,
    status: 'placed',
    payment_status: 'paid',
    fulfillment_status: 'unfulfilled',
    currency_code: 'USD',
    subtotal_amount_cents: 5000,
    total_tax_amount_cents: 450,
    discount_amount_cents: 500,
    shipping_amount_cents: 1000,
    total_amount_cents: 5950,
    customer_email: 'jane@example.com',
    customer_phone: '+1-555-0100',
    coupon_code: 'SUMMER20',
    created_at: '2024-07-01T10:00:00.000Z',
    updated_at: '2024-07-02T08:00:00.000Z',
    placed_at: '2024-07-01T10:05:00.000Z',
    billing_address: {
      line_1: '123 Main St',
      city: 'New York',
      state_code: 'NY',
      zip_code: '10001',
      country_code: 'US',
    },
    shipping_address: {
      line_1: '456 Ship Ave',
      city: 'Brooklyn',
      state_code: 'NY',
      zip_code: '11201',
      country_code: 'US',
    },
    line_items: [
      {
        id: 'li-001',
        sku_code: 'TSHIRT-BLU-M',
        name: 'Blue T-Shirt Medium',
        quantity: 2,
        unit_amount_cents: 2500,
        currency_code: 'USD',
        _type: 'line_items',
      },
    ],
    _type: 'orders',
    _relationships: {
      customer: { data: { type: 'customers', id: 'cust-001' } },
    },
    ...overrides,
  }
}

describe('transformOrder (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-001')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+1-555-0100')
    expect(result.currency).toBe('USD')
  })

  it('maps money from cents', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 5000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 450, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5950, currency: 'USD' })
  })

  it('maps paid payment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps authorized payment status', () => {
    const result = transformOrder(makeOrder({ payment_status: 'authorized' }))
    expect(result.financialStatus).toBe('AUTHORIZED')
  })

  it('maps partially_paid payment status', () => {
    const result = transformOrder(makeOrder({ payment_status: 'partially_paid' }))
    expect(result.financialStatus).toBe('PARTIALLY_PAID')
  })

  it('maps refunded payment status', () => {
    const result = transformOrder(makeOrder({ payment_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps voided payment status', () => {
    const result = transformOrder(makeOrder({ payment_status: 'voided' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps fulfilled fulfillment status', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'fulfilled' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps in_progress fulfillment status', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'in_progress' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps customer id from relationships', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cust-001')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.sku).toBe('TSHIRT-BLU-M')
    expect(li.title).toBe('Blue T-Shirt Medium')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2500, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('New York')
    expect(result.shippingAddress?.city).toBe('Brooklyn')
  })

  it('maps discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SUMMER20'])
  })

  it('maps cancelled order', () => {
    const result = transformOrder(makeOrder({
      cancelled_at: '2024-07-03T10:00:00.000Z',
      cancel_reason: 'Customer request',
    }))
    expect(result.cancelledAt).toBe('2024-07-03T10:00:00.000Z')
    expect(result.cancelReason).toBe('Customer request')
  })

  it('handles null phone', () => {
    const result = transformOrder(makeOrder({ customer_phone: null }))
    expect(result.phone).toBeUndefined()
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

describe('untransformOrder (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformOrder({
      email: 'test@example.com',
      discountCodes: ['SAVE10'],
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('orders')
    expect(body.data.attributes['customer_email']).toBe('test@example.com')
    expect(body.data.attributes['coupon_code']).toBe('SAVE10')
  })
})
