import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawManomanoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawManomanoOrder> = {}): RawManomanoOrder {
  return {
    order_reference: 'ORD-1042',
    seller_contract_id: 'CONTRACT-7',
    status: 'ACCEPTED',
    products: [
      {
        id: 'LI-1',
        sku: 'DRILL-001',
        product_title: 'Power Drill 18V',
        quantity: 2,
        unit_price: { amount: 29.99, currency: 'EUR' },
        total_price: { amount: 59.98, currency: 'EUR' },
      },
    ],
    addresses: {
      shipping: {
        firstname: 'Jean',
        lastname: 'Dupont',
        address_line1: '12 Rue de la Paix',
        address_line2: 'Apt 3',
        city: 'Paris',
        zipcode: '75001',
        country_iso: 'FR',
        phone: '+33123456789',
      },
      billing: {
        firstname: 'Jean',
        lastname: 'Dupont',
        address_line1: '12 Rue de la Paix',
        city: 'Paris',
        zipcode: '75001',
        country_iso: 'FR',
      },
    },
    customer: {
      id: 'CUS-55',
      email: 'jean.dupont@example.com',
      firstname: 'Jean',
      lastname: 'Dupont',
      phone: '+33123456789',
    },
    total_amount: { amount: 64.98, currency: 'EUR' },
    subtotal_amount: { amount: 59.98, currency: 'EUR' },
    shipping_amount: { amount: 5.0, currency: 'EUR' },
    tax_amount: { amount: 10.83, currency: 'EUR' },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    accepted_at: '2024-03-01T01:00:00Z',
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  }
}

describe('transformOrder (ManoMano)', () => {
  it('uses order_reference as canonical id', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ORD-1042')
    expect(result.orderNumber).toBe('ORD-1042')
    expect(result.name).toBe('ORD-1042')
  })

  it('maps customer id and contact info', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('CUS-55')
    expect(result.email).toBe('jean.dupont@example.com')
    expect(result.phone).toBe('+33123456789')
  })

  it('derives currency from total_amount', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('EUR')
  })

  it('converts money objects from major to minor units', () => {
    const result = transformOrder(makeRaw())
    // 64.98 EUR → 6498 cents
    expect(result.totalPrice).toEqual({ amount: 6498, currency: 'EUR' })
    // 59.98 EUR → 5998 cents
    expect(result.subtotalPrice).toEqual({ amount: 5998, currency: 'EUR' })
    // 5.00 EUR → 500 cents
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'EUR' })
    // 10.83 EUR → 1083 cents
    expect(result.totalTax).toEqual({ amount: 1083, currency: 'EUR' })
  })

  it('maps ACCEPTED status to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'ACCEPTED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps SHIPPED status to PAID / FULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'SHIPPED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps CANCELLED status to VOIDED / RESTOCKED', () => {
    const result = transformOrder(makeRaw({ status: 'CANCELLED' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps REFUNDED status to REFUNDED / RESTOCKED', () => {
    const result = transformOrder(makeRaw({ status: 'REFUNDED' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps PENDING status to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeRaw({ status: 'PENDING' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items from products array', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LI-1')
    expect(li.title).toBe('Power Drill 18V')
    expect(li.sku).toBe('DRILL-001')
    expect(li.quantity).toBe(2)
    // 29.99 EUR → 2999 cents
    expect(li.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps shipping address using ManoMano-specific field names', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress).toMatchObject({
      line1: '12 Rue de la Paix',
      line2: 'Apt 3',
      city: 'Paris',
      postalCode: '75001',
      country: 'FR',
    })
  })

  it('maps billing address', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress).toMatchObject({
      line1: '12 Rue de la Paix',
      city: 'Paris',
      postalCode: '75001',
      country: 'FR',
    })
  })

  it('maps datetime fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-01T01:00:00.000Z')
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps cancelledAt and cancelReason for cancelled orders', () => {
    const result = transformOrder(
      makeRaw({
        status: 'CANCELLED',
        cancelled_at: '2024-03-03T00:00:00Z',
        cancel_reason: 'Out of stock',
      }),
    )
    expect(result.cancelledAt).toBe('2024-03-03T00:00:00.000Z')
    expect(result.cancelReason).toBe('Out of stock')
  })

  it('handles missing addresses gracefully', () => {
    const result = transformOrder(makeRaw({ addresses: null }))
    expect(result.shippingAddress).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
  })

  it('handles empty products array', () => {
    const result = transformOrder(makeRaw({ products: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('falls back to EUR when no currency present', () => {
    const result = transformOrder(makeRaw({ total_amount: null, subtotal_amount: null }))
    expect(result.currency).toBe('EUR')
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })
})
