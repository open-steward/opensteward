import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ShipMozoManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shipmozo/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeRaw(overrides: Partial<ShipMozoManifest> = {}): ShipMozoManifest {
  return {
    manifest_id: 'SMZ-MAN-001',
    carrier: 'Delhivery',
    awb_numbers: ['AWB-001', 'AWB-002', 'AWB-003'],
    status: 'generated',
    manifest_url: 'https://manifests.example/SMZ-MAN-001.pdf',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformManifest', () => {
  it('maps id from manifest_id', () => {
    expect(transformManifest(makeRaw()).id).toBe('SMZ-MAN-001')
  })

  it('maps id from numeric manifest_id', () => {
    expect(transformManifest(makeRaw({ manifest_id: 42 })).id).toBe('42')
  })

  it('maps carrierId from carrier', () => {
    expect(transformManifest(makeRaw()).carrierId).toBe('Delhivery')
  })

  it('defaults carrierId to shipmozo when carrier absent', () => {
    expect(transformManifest(makeRaw({ carrier: null })).carrierId).toBe('shipmozo')
  })

  it('maps shipmentIds from awb_numbers', () => {
    expect(transformManifest(makeRaw()).shipmentIds).toEqual(['AWB-001', 'AWB-002', 'AWB-003'])
  })

  it('maps labelCount from awb_numbers length', () => {
    expect(transformManifest(makeRaw()).labelCount).toBe(3)
  })

  it('always emits SUBMITTED status', () => {
    expect(transformManifest(makeRaw({ status: 'open' })).status).toBe('SUBMITTED')
  })

  it('maps submittedAt from created_at', () => {
    expect(transformManifest(makeRaw()).submittedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('maps createdAt from created_at', () => {
    expect(transformManifest(makeRaw()).createdAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformManifest(makeRaw())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('handles empty awb_numbers', () => {
    const result = transformManifest(makeRaw({ awb_numbers: [] }))
    expect(result.shipmentIds).toEqual([])
    expect(result.labelCount).toBe(0)
  })
})
