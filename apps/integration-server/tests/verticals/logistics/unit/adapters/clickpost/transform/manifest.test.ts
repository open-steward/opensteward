import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ClickPostManifest,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

describe('clickpost transformManifest', () => {
  function makeManifest(overrides: Partial<ClickPostManifest> = {}): ClickPostManifest {
    return {
      manifest_id: 'MFT-001',
      status: 'SUBMITTED',
      cp_id: 42,
      carrier_name: 'Delhivery',
      waybills: ['AWB-001', 'AWB-002'],
      awb_count: 2,
      submitted_at: '2024-03-01T18:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T18:00:00Z',
      ...overrides,
    }
  }

  it('maps id, carrierId, manifestNumber', () => {
    const r = transformManifest(makeManifest())
    expect(r.id).toBe('MFT-001')
    expect(r.carrierId).toBe('42')
    expect(r.manifestNumber).toBe('MFT-001')
  })

  it('maps status to SUBMITTED', () => {
    expect(transformManifest(makeManifest()).status).toBe('SUBMITTED')
  })

  it('maps shipmentIds from waybills', () => {
    const r = transformManifest(makeManifest())
    expect(r.shipmentIds).toEqual(['AWB-001', 'AWB-002'])
  })

  it('maps labelCount and dates', () => {
    const r = transformManifest(makeManifest())
    expect(r.labelCount).toBe(2)
    expect(r.submittedAt).toBeInstanceOf(Date)
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['OPEN', 'OPEN'],
      ['CLOSED', 'CLOSED'],
      ['GENERATED', 'CLOSED'],
      ['SUBMITTED', 'SUBMITTED'],
      ['ACCEPTED', 'ACCEPTED'],
      ['APPROVED', 'ACCEPTED'],
    ]
    for (const [s, expected] of cases) {
      expect(transformManifest(makeManifest({ status: s })).status).toBe(expected)
    }
  })

  it('returns undefined status for unrecognized status string', () => {
    expect(transformManifest(makeManifest({ status: 'UNKNOWN_STATUS' })).status).toBeUndefined()
  })

  it('uses carrier_name as carrierId fallback when cp_id is null', () => {
    const r = transformManifest(makeManifest({ cp_id: null }))
    expect(r.carrierId).toBe('Delhivery')
  })

  it('falls back to "clickpost" when both cp_id and carrier_name are null', () => {
    const r = transformManifest(makeManifest({ cp_id: null, carrier_name: null }))
    expect(r.carrierId).toBe('clickpost')
  })

  it('uses fallback id field when manifest_id is null', () => {
    const r = transformManifest(makeManifest({ manifest_id: null, id: 'FALLBACK-ID' }))
    expect(r.id).toBe('FALLBACK-ID')
    expect(r.manifestNumber).toBe('FALLBACK-ID')
  })

  it('falls back to label_count when awb_count is null', () => {
    const r = transformManifest(makeManifest({ awb_count: null, label_count: 5 }))
    expect(r.labelCount).toBe(5)
  })

  it('omits shipmentIds when waybills is empty', () => {
    const r = transformManifest(makeManifest({ waybills: [] }))
    expect(r.shipmentIds).toBeUndefined()
  })

  it('omits shipmentIds when waybills is null', () => {
    const r = transformManifest(makeManifest({ waybills: null }))
    expect(r.shipmentIds).toBeUndefined()
  })

  it('passes ManifestSchema.parse without throwing', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })
})
