import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWayfairShipmentRegistration,
} from '../../../../../../../src/verticals/ecommerce/adapters/wayfair/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(
  overrides: Partial<RawWayfairShipmentRegistration> = {},
): RawWayfairShipmentRegistration {
  return {
    handle: 'wf-handle-abc123',
    submittedAt: '2024-05-01T10:00:00.000Z',
    poNumber: 'PO-20240501-001',
    trackingNumber: '1Z999AA10123456784',
    carrierCode: 'UPS',
    warehouseId: 'wh-east-1',
    errors: null,
    ...overrides,
  }
}

describe('transformFulfillment (Wayfair)', () => {
  it('uses handle as id when present', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('wf-handle-abc123')
  })

  it('falls back to wf-<poNumber> when handle is absent', () => {
    const result = transformFulfillment(makeRaw({ handle: null }))
    expect(result.id).toBe('wf-PO-20240501-001')
  })

  it('sets orderId from poNumber', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.orderId).toBe('PO-20240501-001')
  })

  it('falls back to id for orderId when poNumber is absent', () => {
    const result = transformFulfillment(makeRaw({ poNumber: null }))
    // id is handle when present
    expect(result.orderId).toBe('wf-handle-abc123')
  })

  it('derives status SUCCESS when handle is present and no errors', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('derives status ERROR when errors array is non-empty', () => {
    const result = transformFulfillment(
      makeRaw({ errors: [{ key: 'invalid_po', message: 'PO not found' }] }),
    )
    expect(result.status).toBe('ERROR')
  })

  it('leaves status undefined when no handle and no errors', () => {
    const result = transformFulfillment(makeRaw({ handle: null, errors: null }))
    expect(result.status).toBeUndefined()
  })

  it('maps tracking, carrier and locationId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.locationId).toBe('wh-east-1')
  })

  it('maps createdAt and updatedAt from submittedAt', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('stores raw input in metadata', () => {
    const raw = makeRaw()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformFulfillment', () => {
    const raw = makeRaw()
    const canonical = transformFulfillment(raw)
    const back = untransformFulfillment(canonical)
    expect(back.poNumber).toBe(canonical.orderId)
    expect(back.warehouseId).toBe(canonical.locationId)
    expect(back.trackingNumber).toBe(canonical.trackingNumber)
    expect(back.carrierCode).toBe(canonical.carrier)
  })
})
