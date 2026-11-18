import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawThirtyBeesOrderCarrier,
} from '../../../../../../../src/verticals/ecommerce/adapters/thirty-bees/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrderCarrier(
  overrides: Partial<RawThirtyBeesOrderCarrier> = {},
): RawThirtyBeesOrderCarrier {
  return {
    id: 301,
    id_order: 1001,
    id_carrier: 5,
    tracking_number: 'TRACK123456',
    date_add: '2024-05-02T10:00:00.000Z',
    weight: '0.500000',
    _carrier_name: 'DHL Express',
    ...overrides,
  }
}

describe('transformFulfillment (Thirty Bees)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformFulfillment(makeOrderCarrier())
    expect(result.id).toBe('301')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.trackingNumber).toBe('TRACK123456')
    expect(result.carrier).toBe('DHL Express')
    expect(result.status).toBe('SUCCESS')
    expect(result.shippedAt).toBe('2024-05-02T10:00:00.000Z')
  })

  it('sets PENDING status when no tracking number', () => {
    const result = transformFulfillment(makeOrderCarrier({ tracking_number: null }))
    expect(result.status).toBe('PENDING')
    expect(result.shippedAt).toBeUndefined()
  })

  it('sets PENDING status when tracking number is empty string', () => {
    const result = transformFulfillment(makeOrderCarrier({ tracking_number: '' }))
    expect(result.status).toBe('PENDING')
    expect(result.shippedAt).toBeUndefined()
  })

  it('falls back to carrier id when no enriched name', () => {
    const result = transformFulfillment(makeOrderCarrier({ _carrier_name: undefined }))
    expect(result.carrier).toBe('5')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrderCarrier()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeOrderCarrier())
    const body = untransformFulfillment(canonical)
    expect(body['id_order']).toBe('1001')
    expect(body['tracking_number']).toBe('TRACK123456')
    expect(body['id_carrier']).toBe('DHL Express')
  })

  it('maps createdAt timestamp', () => {
    const result = transformFulfillment(makeOrderCarrier())
    expect(result.createdAt).toBe('2024-05-02T10:00:00.000Z')
  })

  it('returns undefined carrier when neither _carrier_name nor id_carrier are set', () => {
    const result = transformFulfillment(
      makeOrderCarrier({ _carrier_name: undefined, id_carrier: undefined }),
    )
    expect(result.carrier).toBeUndefined()
  })

  it('returns empty string orderId when id_order is not set', () => {
    const result = transformFulfillment(makeOrderCarrier({ id_order: undefined }))
    expect(result.orderId).toBe('')
  })

  it('maps numeric carrier id to string when no name enriched', () => {
    const result = transformFulfillment(
      makeOrderCarrier({ _carrier_name: undefined, id_carrier: 99 }),
    )
    expect(result.carrier).toBe('99')
  })

  it('untransform returns undefined id_carrier when no carrier set', () => {
    const body = untransformFulfillment({ orderId: '1001', trackingNumber: 'XYZ' })
    expect(body['id_carrier']).toBeUndefined()
  })

  it('shippedAt equals date_add when tracking present', () => {
    const result = transformFulfillment(makeOrderCarrier({ date_add: '2024-06-15T08:30:00.000Z' }))
    expect(result.shippedAt).toBe('2024-06-15T08:30:00.000Z')
  })
})
