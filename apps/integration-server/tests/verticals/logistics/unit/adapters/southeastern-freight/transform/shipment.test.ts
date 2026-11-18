import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type SeflPickupResponse,
} from '../../../../../../../src/verticals/logistics/adapters/southeastern-freight/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<SeflPickupResponse> = {}): SeflPickupResponse {
  return {
    confirmation: {
      confirmationNumber: 'CONF-SEFL-001',
      dateTimeSubmitted: '20240301092254429',
      totalShipments: 1,
      totalWeight: 500,
      directPartner: 'Direct',
    },
    message: 'Pickup scheduled successfully',
    ...overrides,
  }
}

describe('southeastern-freight transformShipment', () => {
  it('maps id from confirmationNumber', () => {
    expect(transformShipment(makeRaw()).id).toBe('CONF-SEFL-001')
  })

  it('maps trackingNumber from confirmationNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('CONF-SEFL-001')
  })

  it('maps reference from confirmationNumber', () => {
    expect(transformShipment(makeRaw()).reference).toBe('CONF-SEFL-001')
  })

  it('maps carrierId to southeastern-freight', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('southeastern-freight')
  })

  it('maps status to PENDING', () => {
    expect(transformShipment(makeRaw()).status).toBe('PENDING')
  })

  it('parses dateTimeSubmitted (YYYYMMDDHHmmssSSS format) into createdAt', () => {
    const r = transformShipment(makeRaw())
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt!.getUTCFullYear()).toBe(2024)
    expect(r.createdAt!.getUTCMonth()).toBe(2) // month index 2 = March
    expect(r.createdAt!.getUTCDate()).toBe(1)
  })

  it('falls back createdAt to now when dateTimeSubmitted is absent', () => {
    const before = new Date()
    const raw = makeRaw()
    raw.confirmation = { ...raw.confirmation, dateTimeSubmitted: undefined }
    const r = transformShipment(raw)
    const after = new Date()
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(r.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing confirmation gracefully', () => {
    const r = transformShipment(makeRaw({ confirmation: undefined }))
    expect(r.id).toBeUndefined()
    expect(r.trackingNumber).toBeUndefined()
    expect(r.status).toBe('PENDING')
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('produces schema-valid Shipment', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })
})
