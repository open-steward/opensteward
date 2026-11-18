// NuORDER Shipment fields verified verbatim against
// https://assets.nuorder.com/api-docs/index.html: shipment_id, order_id/
// order_number, tracking_number. No documented GET/list endpoint exists for
// shipments (see metadata.ts) — this is a write-response mapping only.
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawNuorderShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/nuorder/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawNuorderShipment> = {}): RawNuorderShipment {
  return { shipment_id: 9001, order_id: 8001, tracking_number: '1Z999AA10123456784', ...overrides }
}

describe('transformFulfillment (NuORDER Shipment)', () => {
  it('passes the canonical schema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeRaw()))).not.toThrow()
  })

  it('maps shipment_id/order_id to string canonical ids', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('9001')
    expect(result.orderId).toBe('8001')
  })

  it('falls back to tracking_number for id when shipment_id is absent', () => {
    expect(transformFulfillment(makeRaw({ shipment_id: undefined })).id).toBe('1Z999AA10123456784')
  })

  it('falls back to the caller-supplied orderId when the response has neither order_id nor order_number', () => {
    const result = transformFulfillment(makeRaw({ order_id: undefined }), '8001')
    expect(result.orderId).toBe('8001')
  })

  it('throws rather than inventing an id when the response has no identifying field at all', () => {
    expect(() => transformFulfillment({})).toThrow(/id/i)
  })

  it('throws rather than inventing an orderId when none is available anywhere', () => {
    expect(() => transformFulfillment({ shipment_id: 1 })).toThrow(/orderId/i)
  })

  it('maps tracking_number through', () => {
    expect(transformFulfillment(makeRaw()).trackingNumber).toBe('1Z999AA10123456784')
  })

  it('preserves the raw record as metadata', () => {
    const raw = makeRaw()
    expect(transformFulfillment(raw).metadata).toEqual(raw)
  })
})

describe('untransformFulfillment (NuORDER)', () => {
  it('emits only tracking_number — the one confirmed writable field', () => {
    expect(untransformFulfillment({ trackingNumber: 'TRACK1', carrier: 'UPS' })).toEqual({
      tracking_number: 'TRACK1',
    })
  })
})
