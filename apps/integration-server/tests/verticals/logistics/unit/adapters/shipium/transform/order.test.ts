/**
 * Shipium Order → canonical Order.
 *
 * The fixture is the documented example order from the Pack App guide
 * (https://docs.shipium.com/docs/pack-app-api.md, "Example response body for
 * an order search"), which uses the same `Order` schema that
 * searchOrdersV1 / getOrderV1 return
 * (https://docs.shipium.com/reference/searchordersv1.md, components.schemas.Order),
 * plus the documented `orderStatus` and `orderFulfillmentInfo.shipments`
 * fields from the "submitting remaining items" example on the same page.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShipiumOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function documentedOrder(overrides: Partial<ShipiumOrder> = {}): ShipiumOrder {
  return {
    fulfillmentType: 'customer',
    orderSource: 'external',
    shipiumOrderId: '4dc43fff-c3af-4d7b-8a18-e01f2b4cb312',
    partnerOrderId: 'partner-order:12345',
    associatedIdentifiers: ['lpn-barcode:12345'],
    tenantId: null,
    orderedDateTime: '2025-03-15T10:10:00.111111Z',
    orderItemQuantities: [
      {
        shipiumOrderId: '4dc43fff-c3af-4d7b-8a18-e01f2b4cb312',
        partnerOrderId: 'partner-order:12345',
        orderItemReferenceIdentifier: 'partner-order:12334_item:1',
        hazmat: false,
        productId: 'SKU-12345',
        quantity: 3,
        productDetails: null,
      },
    ],
    shipFromAddress: null,
    originId: 'origin-1',
    destinationAddress: {
      name: 'Wile E. Coyote',
      phoneNumber: '9995551234',
      phoneNumberCountryCode: '+1',
      emailAddress: 'wile.e.coyote@example.com',
      company: 'ACME',
      street1: '123 Main St.',
      street2: 'Suite 42',
      city: 'Albuquerque',
      state: 'NM',
      countryCode: 'US',
      postalCode: '87121',
      addressType: 'residential',
      addressLineComponents: null,
    },
    shipOption: null,
    customsInfo: null,
    totalDeclaredValue: null,
    orderStatus: 'complete_multiship',
    orderFulfillmentInfo: {
      shipments: [
        { shipiumShipmentId: 'ship-001-abc123' },
        { shipiumShipmentId: 'ship-002-def456' },
      ],
    },
    ...overrides,
  }
}

describe('shipium transformOrder (documented Order schema)', () => {
  it('parses with OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(documentedOrder()))).not.toThrow()
  })

  it('maps the documented identifiers', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.id).toBe('4dc43fff-c3af-4d7b-8a18-e01f2b4cb312')
    expect(o.orderNumber).toBe('partner-order:12345')
    expect(o.warehouseId).toBe('origin-1')
  })

  it('maps orderedDateTime to orderAt', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.orderAt?.toISOString()).toBe('2025-03-15T10:10:00.111Z')
  })

  it('maps the CSAddress fields, including phoneNumber and emailAddress', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.destinationAddress).toEqual({
      name: 'Wile E. Coyote',
      company: 'ACME',
      street1: '123 Main St.',
      street2: 'Suite 42',
      city: 'Albuquerque',
      state: 'NM',
      postalCode: '87121',
      country: 'US',
      phone: '9995551234',
      email: 'wile.e.coyote@example.com',
    })
    expect(o.originAddress).toBeUndefined()
  })

  it('maps orderItemQuantities to line items', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.lineItems).toEqual([
      { id: 'partner-order:12334_item:1', sku: 'SKU-12345', quantity: 3 },
    ])
  })

  it('maps the documented OrderItem.productDescription to the line description', () => {
    const o = OrderSchema.parse(
      transformOrder(
        documentedOrder({
          orderItemQuantities: [
            { productId: 'SKU-12345', quantity: 1, productDescription: 'Anvil' },
          ],
        }),
      ),
    )
    expect(o.lineItems?.[0]?.description).toBe('Anvil')
  })

  it('omits a countryCode that is not ISO 3166-1 alpha-2 rather than guessing', () => {
    const o = OrderSchema.parse(
      transformOrder(
        documentedOrder({ destinationAddress: { countryCode: 'USA', postalCode: '87121' } }),
      ),
    )
    expect(o.destinationAddress?.country).toBeUndefined()
    expect(o.destinationAddress?.postalCode).toBe('87121')
  })

  it('maps orderFulfillmentInfo.shipments to shipmentIds', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(o.shipmentIds).toEqual(['ship-001-abc123', 'ship-002-def456'])
    const none = OrderSchema.parse(transformOrder(documentedOrder({ orderFulfillmentInfo: null })))
    expect(none.shipmentIds).toBeUndefined()
  })

  it.each([
    ['open', 'PENDING'],
    ['open_split', 'PENDING'],
    ['partial_ship', 'PROCESSING'],
    ['complete', 'SHIPPED'],
    ['complete_multiship', 'SHIPPED'],
    ['cancelled', 'CANCELLED'],
    ['error', 'unknown'],
  ])('maps the documented orderStatus %s to %s', (raw, want) => {
    const o = OrderSchema.parse(transformOrder(documentedOrder({ orderStatus: raw })))
    expect(o.status).toBe(want)
  })

  it('an absent orderStatus leaves status unset rather than guessing', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder({ orderStatus: undefined })))
    expect(o.status).toBeUndefined()
  })

  it('uppercases a three-letter currencyCode and omits anything else', () => {
    expect(
      OrderSchema.parse(transformOrder(documentedOrder({ currencyCode: 'usd' }))).currency,
    ).toBe('USD')
    expect(OrderSchema.parse(transformOrder(documentedOrder())).currency).toBeUndefined()
    expect(
      OrderSchema.parse(transformOrder(documentedOrder({ currencyCode: 'US Dollar' }))).currency,
    ).toBeUndefined()
  })

  it('maps shipOption to requestedServiceCode', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder({ shipOption: 'Standard' })))
    expect(o.requestedServiceCode).toBe('Standard')
  })

  it('throws when the required shipiumOrderId is missing', () => {
    expect(() => transformOrder(documentedOrder({ shipiumOrderId: undefined }))).toThrow(
      /shipiumOrderId/,
    )
  })

  it('keeps the raw order as metadata', () => {
    const raw = documentedOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
