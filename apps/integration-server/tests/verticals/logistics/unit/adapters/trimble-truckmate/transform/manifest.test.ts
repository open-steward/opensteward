import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type TrimbleTruckmateManifestResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(
  overrides: Partial<TrimbleTruckmateManifestResponse> = {},
): TrimbleTruckmateManifestResponse {
  return {
    manifestId: 'MFT-001',
    carrierId: 'trimble-truckmate',
    warehouseId: 'WH-001',
    manifestNumber: 'MAN-001',
    manifestStatus: 'SUBMITTED',
    shipmentIds: ['SHP-001', 'SHP-002'],
    labelCount: 2,
    submittedAt: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('trimble-truckmate transformManifest', () => {
  it('maps id from manifestId', () => {
    expect(transformManifest(makeManifest()).id).toBe('MFT-001')
  })

  it('maps carrierId', () => {
    expect(transformManifest(makeManifest()).carrierId).toBe('trimble-truckmate')
  })

  it('maps warehouseId', () => {
    expect(transformManifest(makeManifest()).warehouseId).toBe('WH-001')
  })

  it('maps manifestNumber', () => {
    expect(transformManifest(makeManifest()).manifestNumber).toBe('MAN-001')
  })

  it('maps manifestStatus SUBMITTED', () => {
    // STATUS_MAP: 'SUBMITTED' → 'SUBMITTED'
    expect(transformManifest(makeManifest()).status).toBe('SUBMITTED')
  })

  it('maps OPEN status', () => {
    expect(transformManifest(makeManifest({ manifestStatus: 'OPEN' })).status).toBe('OPEN')
  })

  it('maps ACCEPTED status', () => {
    expect(transformManifest(makeManifest({ manifestStatus: 'ACCEPTED' })).status).toBe('ACCEPTED')
  })

  it('maps shipmentIds array', () => {
    const result = transformManifest(makeManifest())
    expect(result.shipmentIds).toEqual(['SHP-001', 'SHP-002'])
  })

  it('maps labelCount', () => {
    expect(transformManifest(makeManifest()).labelCount).toBe(2)
  })

  it('maps submittedAt as Date', () => {
    expect(transformManifest(makeManifest()).submittedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformManifest(makeManifest())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('falls back id to raw.id', () => {
    expect(transformManifest(makeManifest({ manifestId: undefined, id: 'ID-002' })).id).toBe(
      'ID-002',
    )
  })

  it('falls back carrierId to carrierCode then default', () => {
    const result = transformManifest(makeManifest({ carrierId: undefined, carrierCode: 'TRMT' }))
    expect(result.carrierId).toBe('TRMT')
  })

  it('defaults carrierId to trimble-truckmate when both absent', () => {
    const result = transformManifest(makeManifest({ carrierId: undefined, carrierCode: undefined }))
    expect(result.carrierId).toBe('trimble-truckmate')
  })

  it('falls back to tripIds when shipmentIds absent', () => {
    const result = transformManifest(makeManifest({ shipmentIds: undefined, tripIds: ['TRIP-1'] }))
    expect(result.shipmentIds).toEqual(['TRIP-1'])
  })

  it('emits undefined shipmentIds for empty arrays', () => {
    const result = transformManifest(makeManifest({ shipmentIds: [] }))
    expect(result.shipmentIds).toBeUndefined()
  })

  it('passes metadata through', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })
})
