import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawVolusionShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawVolusionShipment> = {}): RawVolusionShipment {
  return {
    ShipmentID: 7001,
    OrderID: 4001,
    ShipmentStatus: 'Shipped',
    TrackingNumber: '1Z999AA10123456784',
    TrackingURL: 'https://track.example.com/1Z999AA10123456784',
    Carrier: 'UPS',
    ShipmentDate: '2024-05-02T10:00:00Z',
    DateCreated: '2024-05-02T09:00:00Z',
    LastModified: '2024-05-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('4001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
  })

  it('maps pending status', () => {
    const result = transformFulfillment(makeShipment({ ShipmentStatus: 'Pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled status', () => {
    const result = transformFulfillment(makeShipment({ ShipmentStatus: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
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

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const raw = untransformFulfillment(canonical)
    expect(raw.OrderID).toBe('4001')
    expect(raw.TrackingNumber).toBe('1Z999AA10123456784')
    expect(raw.Carrier).toBe('UPS')
  })
})
