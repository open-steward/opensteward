import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCentraShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawCentraShipment> = {}): RawCentraShipment {
  return {
    shipmentId: 201,
    orderId: 1001,
    shippedDate: '2024-03-05T00:00:00Z',
    carrier: 'PostNord',
    service: 'Standard',
    trackingId: 'SE987654321SE',
    trackingUrl: 'https://track.postnord.com/SE987654321SE',
    warehouseId: 5,
    products: [{ lineId: 301, qty: 2 }],
    shouldCapture: false,
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps shipmentId to id string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('201')
  })

  it('maps orderId to string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.orderId).toBe('1001')
  })

  it('always sets status to SUCCESS (Centra shipments that exist are fulfilled)', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps trackingId to trackingNumber', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('SE987654321SE')
  })

  it('maps trackingUrl', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingUrl).toBe('https://track.postnord.com/SE987654321SE')
  })

  it('maps carrier and service', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('PostNord')
    expect(result.service).toBe('Standard')
  })

  it('maps warehouseId to locationId string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.locationId).toBe('5')
  })

  it('maps products (lineId/qty) to line items', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('301')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps shippedDate to createdAt and updatedAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformFulfillment(makeShipment())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.createdAt).toBe('2024-03-05T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const raw = untransformFulfillment(canonical)
    expect(raw.carrier).toBe('PostNord')
    expect(raw.trackingId).toBe('SE987654321SE')
    expect(raw.warehouseId).toBe('5')
  })
})
