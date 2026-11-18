import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawBolOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bol/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawBolOrder> = {}): RawBolOrder {
  return {
    orderId: '1043946570',
    orderPlacedDateTime: '2024-11-20T10:30:00+01:00',
    orderItems: [
      {
        orderItemId: 'BFC0000000000001',
        offerId: 'a-1234-offer',
        offerReference: 'WIDGET-NL-001',
        ean: '8712345678901',
        title: 'Premium Dutch Widget',
        quantity: 2,
        quantityShipped: 0,
        quantityCancelled: 0,
        unitPrice: 24.99,
        commission: 3.75,
        fulfilmentMethod: 'FBR',
        fulfilmentStatus: 'OPEN',
      },
    ],
    shipmentDetails: {
      salutation: 'MALE',
      firstName: 'Jan',
      surname: 'de Vries',
      streetName: 'Keizersgracht',
      houseNumber: '100',
      houseNumberExtension: 'A',
      zipCode: '1015 AA',
      city: 'Amsterdam',
      countryCode: 'NL',
      email: 'jan@example.nl',
    },
    billingDetails: {
      salutation: 'MALE',
      firstName: 'Jan',
      surname: 'de Vries',
      streetName: 'Keizersgracht',
      houseNumber: '100',
      zipCode: '1015 AA',
      city: 'Amsterdam',
      countryCode: 'NL',
    },
    ...overrides,
  }
}

describe('transformOrder (Bol.com)', () => {
  it('maps core fields and uses orderId as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1043946570')
    expect(result.orderNumber).toBe('1043946570')
    expect(result.currency).toBe('EUR')
    expect(result.financialStatus).toBe('PAID')
  })

  it('calculates totalPrice from line items', () => {
    const result = transformOrder(makeOrder())
    // 2499 * 2 = 4998 (minor units)
    expect(result.totalPrice).toEqual({ amount: 4998, currency: 'EUR' })
  })

  it('hydrates line items with unit price in EUR', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('BFC0000000000001')
    expect(li.sku).toBe('WIDGET-NL-001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'EUR' })
  })

  it('maps UNFULFILLED when no items shipped', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps PARTIAL when some items shipped', () => {
    const result = transformOrder(
      makeOrder({
        orderItems: [
          {
            orderItemId: 'OI-1',
            quantity: 3,
            quantityShipped: 1,
            unitPrice: 10,
          },
        ],
      }),
    )
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps FULFILLED when all items shipped', () => {
    const result = transformOrder(
      makeOrder({
        orderItems: [
          {
            orderItemId: 'OI-1',
            quantity: 2,
            quantityShipped: 2,
            unitPrice: 10,
          },
        ],
      }),
    )
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('extracts shipping address from shipmentDetails', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: 'Keizersgracht 100 A',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      country: 'NL',
    })
  })

  it('extracts billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.city).toBe('Amsterdam')
  })

  it('extracts email from shipment details', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('jan@example.nl')
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})
