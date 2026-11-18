/**
 * Virto Commerce OrderShipment → canonical Fulfillment.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Orders/swagger.json `components.schemas.OrderShipment`
 * (fetched 2026-09-13): customerOrderId, fulfillmentCenterId,
 * shipmentMethodCode, trackingNumber, trackingUrl, deliveryDate, status
 * (free-form), createdDate, modifiedDate. There is no carrier name field —
 * only a shipping-method code — so `carrier` is left unmapped rather than
 * guessing a display name from the code.
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawVirtoOrderShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawVirtoOrderShipment> = {}): RawVirtoOrderShipment {
  return {
    id: 'ship-1',
    customerOrderId: 'order-1',
    fulfillmentCenterId: 'fc-1',
    shipmentMethodCode: 'FedEx-Ground',
    trackingNumber: '1Z999AA10123456784',
    trackingUrl: 'https://www.fedex.com/track?tracknum=1Z999AA10123456784',
    status: 'Sent',
    deliveryDate: '2026-01-17T16:45:00Z',
    createdDate: '2026-01-15T09:30:00Z',
    modifiedDate: '2026-01-17T16:45:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('ship-1')
    expect(result.orderId).toBe('order-1')
    expect(result.locationId).toBe('fc-1')
  })

  it('maps tracking fields and the shipment method code as service', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://www.fedex.com/track?tracknum=1Z999AA10123456784')
    expect(result.service).toBe('FedEx-Ground')
    expect(result.carrier).toBeUndefined()
  })

  it('maps deliveredAt from deliveryDate', () => {
    expect(transformFulfillment(makeShipment()).deliveredAt).toBe('2026-01-17T16:45:00Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeShipment()
    expect(transformFulfillment(raw).metadata).toEqual(raw)
  })

  it('satisfies FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeShipment()))).not.toThrow()
  })

  it('throws rather than fabricate orderId when customerOrderId is missing', () => {
    expect(() => transformFulfillment(makeShipment({ customerOrderId: undefined }))).toThrow(
      /customerOrderId/,
    )
  })
})
