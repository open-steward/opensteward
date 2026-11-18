import { describe, it, expect } from 'vitest'
import {
  transformShippingPackage,
  untransformShippingPackage,
  type RawPlentyOneShippingPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makePackage(
  overrides: Partial<RawPlentyOneShippingPackage> = {},
): RawPlentyOneShippingPackage {
  return {
    id: 4001,
    orderId: 7001,
    packageNumber: 'PKG-4001-TRACK',
    labelUrl: 'https://labels.dhl.com/4001.pdf',
    carrier: 'DHL',
    warehouseId: 22,
    status: 'sent',
    shipmentDate: '2024-05-10T08:00:00.000Z',
    deliveryDate: '2024-05-14T00:00:00.000Z',
    createdAt: '2024-05-10T07:00:00.000Z',
    updatedAt: '2024-05-10T08:30:00.000Z',
    orderItems: [
      { orderItemId: 9001, quantity: 2 },
      { orderItemId: 9002, quantity: 1 },
    ],
    ...overrides,
  }
}

describe('plentyone transformShippingPackage', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformShippingPackage(makePackage(), '7001')
    expect(result.id).toBe('4001')
    expect(result.orderId).toBe('7001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('PKG-4001-TRACK')
    expect(result.trackingUrl).toBe('https://labels.dhl.com/4001.pdf')
    expect(result.carrier).toBe('DHL')
    expect(result.locationId).toBe('22')
  })

  it('maps order items as fulfillment line items', () => {
    const result = transformShippingPackage(makePackage(), '7001')
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('9001')
    expect(result.lineItems![0]!.quantity).toBe(2)
    expect(result.lineItems![1]!.lineItemId).toBe('9002')
  })

  it('maps shipment and delivery dates as ISO strings', () => {
    const result = transformShippingPackage(makePackage(), '7001')
    expect(result.shippedAt).toBe('2024-05-10T08:00:00.000Z')
    expect(result.estimatedDeliveryAt).toBe('2024-05-14T00:00:00.000Z')
  })

  it('maps PENDING for "registered" status', () => {
    const result = transformShippingPackage(makePackage({ status: 'registered' }), '7001')
    expect(result.status).toBe('PENDING')
  })

  it('maps CANCELLED for both "cancelled" and "canceled" spellings', () => {
    const r1 = transformShippingPackage(makePackage({ status: 'cancelled' }), '7001')
    expect(r1.status).toBe('CANCELLED')
    const r2 = transformShippingPackage(makePackage({ status: 'canceled' }), '7001')
    expect(r2.status).toBe('CANCELLED')
  })

  it('falls back to the supplied orderId when orderId absent on raw', () => {
    const result = transformShippingPackage(makePackage({ orderId: undefined }), '9999')
    expect(result.orderId).toBe('9999')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePackage()
    const result = transformShippingPackage(raw, '7001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformShippingPackage(makePackage(), '7001')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformShippingPackage', () => {
    const canonical = transformShippingPackage(makePackage(), '7001')
    const raw = untransformShippingPackage(canonical)
    expect(raw.packageNumber).toBe('PKG-4001-TRACK')
    expect(raw.carrier).toBe('DHL')
    expect(raw.warehouseId).toBe(22)
  })
})
