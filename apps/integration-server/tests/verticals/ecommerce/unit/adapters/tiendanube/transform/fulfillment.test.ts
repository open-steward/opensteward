import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawTiendanubeFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(
  overrides: Partial<RawTiendanubeFulfillment> = {},
): RawTiendanubeFulfillment {
  return {
    id: 300,
    order_id: 1042,
    status: 'shipped',
    tracking_number: 'TRACK123',
    tracking_url: 'https://ups.com/track?n=TRACK123',
    shipping_carrier_name: 'UPS',
    service: 'Ground',
    location_id: 5,
    line_items: [{ id: 101, quantity: 2 }],
    notify_customer: true,
    shipped_at: '2026-01-15T09:30:00.000Z',
    estimated_delivery_at: '2026-01-18T09:30:00.000Z',
    delivered_at: '2026-01-17T16:45:00.000Z',
    created_at: '2026-01-15T09:00:00.000Z',
    updated_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (Tiendanube)', () => {
  it('maps id, orderId and carrier from shipping_carrier_name', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('300')
    expect(result.orderId).toBe('1042')
    expect(result.carrier).toBe('UPS')
  })

  it('maps status strings to canonical FulfillmentStatus', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'shipped' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'delivered' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'packed' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('TRACK123')
    expect(result.trackingUrl).toBe('https://ups.com/track?n=TRACK123')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('101')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps timestamp fields (shippedAt, estimatedDeliveryAt, deliveredAt)', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.shippedAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.estimatedDeliveryAt).toBe('2026-01-18T09:30:00.000Z')
    expect(result.deliveredAt).toBe('2026-01-17T16:45:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const fulfillment = transformFulfillment(makeFulfillment())
    const body = untransformFulfillment(fulfillment)
    expect(body['tracking_number']).toBe('TRACK123')
    expect(body['shipping_carrier_name']).toBe('UPS')
  })
})
