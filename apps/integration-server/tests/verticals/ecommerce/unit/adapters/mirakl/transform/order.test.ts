import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawMiraklOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawMiraklOrder> = {}): RawMiraklOrder {
  return {
    order_id: 'MKL-0001',
    order_state: 'RECEIVED',
    currency_iso_code: 'EUR',
    created_date: '2024-03-01T00:00:00Z',
    last_updated_date: '2024-03-02T00:00:00Z',
    payment_date: '2024-03-01T01:00:00Z',
    customer: {
      customer_id: 'CUST-42',
      email: 'buyer@example.com',
      billing_address: {
        firstname: 'Jean',
        lastname: 'Dupont',
        street_1: '12 Rue de Rivoli',
        city: 'Paris',
        zip_code: '75001',
        country_iso_code: 'FR',
        phone: '+33123456789',
      },
      shipping_address: {
        firstname: 'Jean',
        lastname: 'Dupont',
        street_1: '12 Rue de Rivoli',
        city: 'Paris',
        zip_code: '75001',
        country_iso_code: 'FR',
      },
    },
    total_price: { amount: 59.9, currency_iso_code: 'EUR' },
    total_shipping_price: { amount: 4.9, currency_iso_code: 'EUR' },
    order_lines: [
      {
        id: 'LINE-1',
        offer_id: 'OFFER-99',
        offer_sku: 'SKU-A',
        product_title: 'Widget Pro',
        quantity: 2,
        price: { amount: 25.0, currency_iso_code: 'EUR' },
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (Mirakl)', () => {
  it('maps order_id to canonical id, orderNumber, and name', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('MKL-0001')
    expect(result.orderNumber).toBe('MKL-0001')
    expect(result.name).toBe('MKL-0001')
  })

  it('converts total_price major units to minor units', () => {
    const result = transformOrder(makeRaw())
    // EUR has 2 decimal digits → 59.90 × 100 = 5990
    expect(result.totalPrice).toEqual({ amount: 5990, currency: 'EUR' })
  })

  it('maps RECEIVED state to PAID / FULFILLED', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps CANCELED state to VOIDED / UNFULFILLED and sets cancelledAt', () => {
    const result = transformOrder(
      makeRaw({ order_state: 'CANCELED', last_updated_date: '2024-03-05T00:00:00Z' }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('maps SHIPPING state to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeRaw({ order_state: 'SHIPPING' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps SHIPPED state to PAID / PARTIAL', () => {
    const result = transformOrder(makeRaw({ order_state: 'SHIPPED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps line items with price conversion', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LINE-1')
    expect(li.title).toBe('Widget Pro')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2500, currency: 'EUR' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress).toMatchObject({
      line1: '12 Rue de Rivoli',
      city: 'Paris',
      postalCode: '75001',
      country: 'FR',
    })
  })

  it('maps billing address from customer billing_address', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress).toMatchObject({
      line1: '12 Rue de Rivoli',
      city: 'Paris',
      country: 'FR',
    })
  })

  it('maps customer email and customerId', () => {
    const result = transformOrder(makeRaw())
    expect(result.email).toBe('buyer@example.com')
    expect(result.customerId).toBe('CUST-42')
  })

  it('defaults currency to EUR when not provided', () => {
    const result = transformOrder(makeRaw({ currency_iso_code: undefined }))
    expect(result.currency).toBe('EUR')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })
})
