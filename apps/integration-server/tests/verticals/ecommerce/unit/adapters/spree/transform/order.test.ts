import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSpreeOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSpreeOrder> = {}): RawSpreeOrder {
  return {
    id: 500,
    number: 'R123456789',
    state: 'complete',
    payment_state: 'paid',
    shipment_state: 'shipped',
    email: 'alice@example.com',
    user_id: 10,
    currency: 'USD',
    item_total: '49.98',
    total: '59.93',
    ship_total: '5.00',
    additional_tax_total: '4.95',
    promo_total: '-5.00',
    item_count: 2,
    special_instructions: 'Leave at door',
    completed_at: '2024-02-20T15:00:00.000Z',
    canceled_at: null,
    created_at: '2024-02-20T14:00:00.000Z',
    updated_at: '2024-02-20T15:00:00.000Z',
    bill_address: {
      firstname: 'Alice',
      lastname: 'Johnson',
      address1: '456 Oak Ave',
      city: 'Seattle',
      state_name: 'Washington',
      zipcode: '98101',
      country_iso: 'US',
      phone: '+1-555-0200',
    },
    ship_address: {
      firstname: 'Alice',
      lastname: 'Johnson',
      address1: '456 Oak Ave',
      city: 'Seattle',
      state_name: 'Washington',
      zipcode: '98101',
      country_iso: 'US',
    },
    line_items: [
      {
        id: 1001,
        variant_id: 101,
        product_id: 42,
        name: 'Spree T-Shirt (Red / S)',
        quantity: 2,
        price: '24.99',
        sku: 'TSH-RED-S',
        adjustment_total: '-2.50',
      },
    ],
    coupon_codes: ['SAVE10'],
    shipment_ids: [301],
    ...overrides,
  }
}

describe('transformOrder (Spree)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('500')
    expect(result.orderNumber).toBe('R123456789')
    expect(result.name).toBe('#R123456789')
    expect(result.customerId).toBe('10')
    expect(result.email).toBe('alice@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 5993, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 495, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps financial status from payment_state', () => {
    expect(transformOrder(makeOrder({ payment_state: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ payment_state: 'balance_due' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ payment_state: 'credit_owed' })).financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(transformOrder(makeOrder({ payment_state: 'void' })).financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status from shipment_state', () => {
    expect(transformOrder(makeOrder({ shipment_state: 'shipped' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ shipment_state: 'pending' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ shipment_state: 'partial' })).fulfillmentStatus).toBe('PARTIAL')
    expect(transformOrder(makeOrder({ shipment_state: 'canceled' })).fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('101')
    expect(li.title).toBe('Spree T-Shirt (Red / S)')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(li.totalDiscount).toEqual({ amount: 250, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('456 Oak Ave')
    expect(result.shippingAddress?.city).toBe('Seattle')
  })

  it('maps discount codes and fulfillment IDs', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
    expect(result.fulfillmentIds).toEqual(['301'])
  })

  it('maps note and dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
    expect(result.processedAt).toBe('2024-02-20T15:00:00.000Z')
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps cancelledAt when present', () => {
    const result = transformOrder(makeOrder({ canceled_at: '2024-03-01T12:00:00.000Z' }))
    expect(result.cancelledAt).toBe('2024-03-01T12:00:00.000Z')
  })

  it('preserves metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
