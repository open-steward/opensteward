import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSolidusOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSolidusOrder> = {}): RawSolidusOrder {
  return {
    id: 500,
    number: 'R987654321',
    state: 'complete',
    payment_state: 'paid',
    shipment_state: 'shipped',
    email: 'bob@example.com',
    user_id: 10,
    currency: 'USD',
    item_total: '119.98',
    total: '134.93',
    ship_total: '10.00',
    additional_tax_total: '9.95',
    promo_total: '-5.00',
    item_count: 2,
    special_instructions: 'Ring doorbell',
    completed_at: '2024-02-20T15:00:00.000Z',
    canceled_at: null,
    canceler_id: null,
    approver_id: 1,
    approved_at: '2024-02-20T14:55:00.000Z',
    created_at: '2024-02-20T14:00:00.000Z',
    updated_at: '2024-02-20T15:00:00.000Z',
    bill_address: {
      firstname: 'Bob',
      lastname: 'Smith',
      address1: '100 Main St',
      city: 'Portland',
      state_name: 'Oregon',
      zipcode: '97201',
      country_iso: 'US',
      phone: '+1-555-0300',
    },
    ship_address: {
      firstname: 'Bob',
      lastname: 'Smith',
      address1: '100 Main St',
      city: 'Portland',
      state_name: 'Oregon',
      zipcode: '97201',
      country_iso: 'US',
    },
    line_items: [
      {
        id: 2001,
        variant_id: 101,
        product_id: 42,
        name: 'Solidus Hoodie (Black / S)',
        quantity: 2,
        price: '59.99',
        sku: 'HOO-BLK-S',
        adjustment_total: '-2.50',
      },
    ],
    coupon_codes: ['WELCOME10'],
    shipment_ids: [601],
    ...overrides,
  }
}

describe('transformOrder (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('500')
    expect(result.orderNumber).toBe('R987654321')
    expect(result.name).toBe('#R987654321')
    expect(result.customerId).toBe('10')
    expect(result.email).toBe('bob@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 11998, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 13493, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 995, currency: 'USD' })
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
    expect(li.id).toBe('2001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('101')
    expect(li.title).toBe('Solidus Hoodie (Black / S)')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5999, currency: 'USD' })
    expect(li.totalDiscount).toEqual({ amount: 250, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('100 Main St')
    expect(result.shippingAddress?.city).toBe('Portland')
  })

  it('maps discount codes and fulfillment IDs', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['WELCOME10'])
    expect(result.fulfillmentIds).toEqual(['601'])
  })

  it('maps note and dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Ring doorbell')
    expect(result.processedAt).toBe('2024-02-20T15:00:00.000Z')
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps cancelledAt when present', () => {
    const result = transformOrder(makeOrder({ canceled_at: '2024-03-01T12:00:00.000Z' }))
    expect(result.cancelledAt).toBe('2024-03-01T12:00:00.000Z')
  })

  it('preserves metadata including Solidus-specific fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    // Solidus-specific fields preserved in metadata
    expect((result.metadata as Record<string, unknown>)['approver_id']).toBe(1)
    expect((result.metadata as Record<string, unknown>)['canceler_id']).toBeNull()
  })

  it('satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
