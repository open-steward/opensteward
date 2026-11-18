import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawZalandoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/zalando/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawZalandoOrder> = {}): RawZalandoOrder {
  return {
    order_number: 'ZAL-2026-1042',
    order_date: '2026-01-15T09:30:00Z',
    last_modified: '2026-01-15T12:00:00Z',
    order_status: 'CREATED',
    currency: 'EUR',
    billing_address: {
      first_name: 'Hans',
      last_name: 'Müller',
      address_line_1: 'Hauptstraße 1',
      city: 'München',
      zip: '80331',
      country_code: 'DE',
    },
    delivery_address: {
      first_name: 'Hans',
      last_name: 'Müller',
      address_line_1: 'Lieferstraße 5',
      city: 'Berlin',
      zip: '10115',
      country_code: 'DE',
    },
    order_units: [
      {
        order_unit_id: 'unit-001',
        article: {
          ean: '4006381333931',
          model_id: 'model-abc',
          name: 'Sneaker Classic White',
          size: '42',
          color: 'White',
        },
        quantity: 1,
        price: { amount: '89.99', currency: 'EUR' },
        tax: { amount: '14.36', currency: 'EUR' },
        fulfillment_status: 'INITIAL',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (Zalando)', () => {
  it('uses order_number as id, orderNumber, and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ZAL-2026-1042')
    expect(result.orderNumber).toBe('ZAL-2026-1042')
    expect(result.name).toBe('ZAL-2026-1042')
  })

  it('maps currency from top-level currency field', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps CREATED status to PAID financial and UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'CREATED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps SHIPPED status to PAID financial and FULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'SHIPPED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps CANCELED status to VOIDED financial and RESTOCKED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'CANCELED' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps RETURNED status to REFUNDED financial and RESTOCKED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'RETURNED' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('converts major-unit price to minor units (EUR × 100)', () => {
    const result = transformOrder(makeOrder())
    // 89.99 EUR = 8999 cents
    expect(result.totalPrice).toEqual({ amount: 8999, currency: 'EUR' })
  })

  it('converts major-unit tax to minor units', () => {
    const result = transformOrder(makeOrder())
    // 14.36 EUR = 1436 cents
    expect(result.totalTax).toEqual({ amount: 1436, currency: 'EUR' })
  })

  it('maps line items with EAN as variantId and sku', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('unit-001')
    expect(li.variantId).toBe('4006381333931')
    expect(li.sku).toBe('4006381333931')
    expect(li.productId).toBe('model-abc')
    expect(li.title).toBe('Sneaker Classic White')
    expect(li.quantity).toBe(1)
  })

  it('maps line item price to minor units', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    expect(li.price).toEqual({ amount: 8999, currency: 'EUR' })
  })

  it('maps INITIAL unit fulfillment_status to UNFULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps billing address correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      line1: 'Hauptstraße 1',
      city: 'München',
      postalCode: '80331',
      country: 'DE',
    })
  })

  it('maps delivery address to shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('Lieferstraße 5')
    expect(result.shippingAddress?.country).toBe('DE')
  })

  it('maps order_date to createdAt and last_modified to updatedAt', () => {
    const result = transformOrder(makeOrder())
    // toIsoDatetime normalises to .000Z millisecond precision
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles empty order_units gracefully', () => {
    const result = transformOrder(makeOrder({ order_units: [] }))
    expect(result.lineItems).toHaveLength(0)
    expect(result.totalPrice).toBeUndefined()
  })
})
