import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCLShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawCLShipment> = {}): RawCLShipment {
  return {
    id: 'ship-001',
    number: 'SHP-1042-01',
    status: 'shipped',
    currency_code: 'USD',
    cost_amount_cents: 1000,
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://track.example.com/1Z999AA10123456784',
    shipping_method_name: 'UPS Ground',
    created_at: '2024-07-01T12:00:00.000Z',
    updated_at: '2024-07-02T08:00:00.000Z',
    shipped_at: '2024-07-02T08:00:00.000Z',
    delivered_at: null,
    _type: 'shipments',
    _relationships: {
      order: { data: { type: 'orders', id: 'order-001' } },
      stock_location: { data: { type: 'stock_locations', id: 'loc-001' } },
    },
    ...overrides,
  }
}

describe('transformFulfillment (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('ship-001')
    expect(result.orderId).toBe('order-001')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://track.example.com/1Z999AA10123456784')
    expect(result.carrier).toBe('UPS Ground')
    expect(result.locationId).toBe('loc-001')
  })

  it('maps shipped status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps picking status to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'picking' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps packing status to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'packing' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps ready_to_ship to OPEN', () => {
    const result = transformFulfillment(makeShipment({ status: 'ready_to_ship' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status', () => {
    const result = transformFulfillment(makeShipment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({
      status: 'delivered',
      delivered_at: '2024-07-05T10:00:00.000Z',
    }))
    expect(result.status).toBe('SUCCESS')
    expect(result.deliveredAt).toBe('2024-07-05T10:00:00.000Z')
  })

  it('maps timestamps', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.shippedAt).toBe('2024-07-02T08:00:00.000Z')
    expect(result.createdAt).toBe('2024-07-01T12:00:00.000Z')
  })

  it('handles null tracking', () => {
    const result = transformFulfillment(makeShipment({
      tracking_number: null,
      tracking_url: null,
    }))
    expect(result.trackingNumber).toBeUndefined()
    expect(result.trackingUrl).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformFulfillment({
      trackingNumber: 'TRACK-123',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('shipments')
    expect(body.data.attributes['tracking_number']).toBe('TRACK-123')
  })
})
