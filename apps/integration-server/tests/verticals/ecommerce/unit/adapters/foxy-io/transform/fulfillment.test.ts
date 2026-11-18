import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawFoxyShipmentFull,
} from '../../../../../../../src/verticals/ecommerce/adapters/foxy-io/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawFoxyShipmentFull> = {}): RawFoxyShipmentFull {
  return {
    id: 300,
    _transactionId: 1001,
    address1: '1 Dispatch Way',
    city: 'Manchester',
    country: 'GB',
    postal_code: 'M1 1AA',
    shipping_service_description: 'Royal Mail Tracked 48',
    date_created: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Foxy.io)', () => {
  it('maps id, orderId, and service', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('300')
    // orderId should come from injected _transactionId
    expect(result.orderId).toBe('1001')
    expect(result.service).toBe('Royal Mail Tracked 48')
  })

  it('falls back to shipment id for orderId when _transactionId is absent', () => {
    const result = transformFulfillment(makeShipment({ _transactionId: undefined }))
    expect(result.orderId).toBe('300')
  })

  it('exposes no status, trackingNumber, or carrier (Foxy limitation)', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrier).toBeUndefined()
  })

  it('maps createdAt and updatedAt timestamps', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
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
