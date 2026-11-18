import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ShippyProManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(overrides: Partial<ShippyProManifest> = {}): ShippyProManifest {
  return {
    ManifestId: 99,
    CarrierName: 'UPS',
    CarrierCode: 'UPS',
    Status: 'SUBMITTED',
    ShipmentIds: ['shp-1', 'shp-2'],
    LabelCount: 2,
    SubmittedAt: '2024-03-01T00:00:00Z',
    CreatedAt: '2024-03-01T00:00:00Z',
    UpdatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformManifest (shippypro)', () => {
  it('coerces numeric ManifestId to string id and manifestNumber', () => {
    const result = transformManifest(makeManifest())
    expect(result.id).toBe('99')
    expect(result.manifestNumber).toBe('99')
  })

  it('maps carrierId from CarrierName (preferred over CarrierCode)', () => {
    expect(transformManifest(makeManifest()).carrierId).toBe('UPS')
  })

  it('falls back to CarrierCode when CarrierName is null', () => {
    expect(transformManifest(makeManifest({ CarrierName: null })).carrierId).toBe('UPS')
  })

  it('falls back to "shippypro" when both are null', () => {
    expect(
      transformManifest(makeManifest({ CarrierName: null, CarrierCode: null })).carrierId,
    ).toBe('shippypro')
  })

  it('maps all manifest statuses', () => {
    expect(transformManifest(makeManifest({ Status: 'OPEN' })).status).toBe('OPEN')
    expect(transformManifest(makeManifest({ Status: 'CLOSED' })).status).toBe('CLOSED')
    expect(transformManifest(makeManifest({ Status: 'SUBMITTED' })).status).toBe('SUBMITTED')
    expect(transformManifest(makeManifest({ Status: 'ACCEPTED' })).status).toBe('ACCEPTED')
    expect(transformManifest(makeManifest({ Status: null })).status).toBeUndefined()
  })

  it('maps shipmentIds from ShipmentIds array', () => {
    const result = transformManifest(makeManifest())
    expect(result.shipmentIds).toEqual(['shp-1', 'shp-2'])
  })

  it('coerces numeric ShipmentIds to strings', () => {
    const result = transformManifest(makeManifest({ ShipmentIds: [101, 102] }))
    expect(result.shipmentIds).toEqual(['101', '102'])
  })

  it('falls back to Orders when ShipmentIds is absent', () => {
    const result = transformManifest(makeManifest({ ShipmentIds: null, Orders: ['ord-1'] }))
    expect(result.shipmentIds).toEqual(['ord-1'])
  })

  it('maps labelCount, submittedAt, createdAt, updatedAt', () => {
    const result = transformManifest(makeManifest())
    expect(result.labelCount).toBe(2)
    expect(result.submittedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ManifestSchema.parse without throwing', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })

  it('shipmentIds is undefined when both ShipmentIds and Orders are empty', () => {
    const result = transformManifest(makeManifest({ ShipmentIds: [], Orders: null }))
    expect(result.shipmentIds).toBeUndefined()
  })
})
