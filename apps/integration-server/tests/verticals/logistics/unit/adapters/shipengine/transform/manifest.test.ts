import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ShipEngineManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(overrides: Partial<ShipEngineManifest> = {}): ShipEngineManifest {
  return {
    manifest_id: 'se-mfst-001',
    form_id: 'fm-001',
    carrier_id: 'se-12345',
    warehouse_id: 'se-wh-001',
    shipments: 3,
    label_ids: ['se-lbl-001', 'se-lbl-002', 'se-lbl-003'],
    ship_date: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformManifest (shipengine)', () => {
  it('maps id from manifest_id', () => {
    expect(transformManifest(makeManifest()).id).toBe('se-mfst-001')
  })

  it('maps manifestNumber from form_id', () => {
    expect(transformManifest(makeManifest()).manifestNumber).toBe('fm-001')
  })

  it('falls back manifestNumber to submission_id when form_id is absent', () => {
    const result = transformManifest(makeManifest({ form_id: null, submission_id: 'sub-001' }))
    expect(result.manifestNumber).toBe('sub-001')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformManifest(makeManifest()).carrierId).toBe('se-12345')
  })

  it('maps warehouseId from warehouse_id', () => {
    expect(transformManifest(makeManifest()).warehouseId).toBe('se-wh-001')
  })

  it('status is always SUBMITTED (ShipEngine manifests are always submitted on creation)', () => {
    expect(transformManifest(makeManifest()).status).toBe('SUBMITTED')
  })

  it('maps labelCount from shipments field', () => {
    expect(transformManifest(makeManifest()).labelCount).toBe(3)
  })

  it('maps submittedAt as Date from ship_date', () => {
    expect(transformManifest(makeManifest()).submittedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date from created_at', () => {
    expect(transformManifest(makeManifest()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('omits labelCount when shipments is not a number', () => {
    const result = transformManifest(makeManifest({ shipments: null }))
    expect(result.labelCount).toBeUndefined()
  })

  it('passes ManifestSchema.parse without throwing', () => {
    const result = transformManifest(makeManifest())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
