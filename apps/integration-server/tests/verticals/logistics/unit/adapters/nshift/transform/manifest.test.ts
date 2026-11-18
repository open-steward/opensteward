import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type NShiftManifest,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<NShiftManifest> = {}): NShiftManifest {
  return {
    id: 'mfst-001',
    manifestNumber: 'MAN-2024-001',
    status: 'SUBMITTED',
    carrierId: 'dhl-de',
    warehouseId: 'wh-stockholm',
    shipmentIds: ['shp-001', 'shp-002', 'shp-003'],
    labelCount: 3,
    submittedAt: '2024-03-01T10:00:00Z',
    created: '2024-03-01T08:00:00Z',
    updated: '2024-03-01T10:05:00Z',
    ...overrides,
  }
}

// ─── transformManifest ────────────────────────────────────────────────────────

describe('transformManifest', () => {
  it('maps id, manifestNumber, warehouseId from raw', () => {
    const raw = makeManifest()
    const result = transformManifest(raw)

    expect(result.id).toBe('mfst-001')
    expect(result.manifestNumber).toBe('MAN-2024-001')
    expect(result.warehouseId).toBe('wh-stockholm')
  })

  it('maps carrierId from raw', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).carrierId).toBe('dhl-de')
  })

  it('falls back carrierId to "nshift" when raw.carrierId is null', () => {
    const raw = makeManifest({ carrierId: null })
    expect(transformManifest(raw).carrierId).toBe('nshift')
  })

  it('maps shipmentIds array', () => {
    const raw = makeManifest()
    const result = transformManifest(raw)

    expect(result.shipmentIds).toEqual(['shp-001', 'shp-002', 'shp-003'])
  })

  it('maps labelCount', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).labelCount).toBe(3)
  })

  it('maps status SUBMITTED correctly', () => {
    const raw = makeManifest({ status: 'SUBMITTED' })
    expect(transformManifest(raw).status).toBe('SUBMITTED')
  })

  it('maps status SENT to SUBMITTED', () => {
    const raw = makeManifest({ status: 'SENT' })
    expect(transformManifest(raw).status).toBe('SUBMITTED')
  })

  it('maps status OPEN correctly', () => {
    const raw = makeManifest({ status: 'OPEN' })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('maps status PENDING to OPEN', () => {
    const raw = makeManifest({ status: 'PENDING' })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('maps status DRAFT to OPEN', () => {
    const raw = makeManifest({ status: 'DRAFT' })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('maps status CLOSED correctly', () => {
    const raw = makeManifest({ status: 'CLOSED' })
    expect(transformManifest(raw).status).toBe('CLOSED')
  })

  it('maps status FINALIZED to CLOSED', () => {
    const raw = makeManifest({ status: 'FINALIZED' })
    expect(transformManifest(raw).status).toBe('CLOSED')
  })

  it('maps status ACCEPTED correctly', () => {
    const raw = makeManifest({ status: 'ACCEPTED' })
    expect(transformManifest(raw).status).toBe('ACCEPTED')
  })

  it('maps status CONFIRMED to ACCEPTED', () => {
    const raw = makeManifest({ status: 'CONFIRMED' })
    expect(transformManifest(raw).status).toBe('ACCEPTED')
  })

  it('defaults unknown status to OPEN', () => {
    const raw = makeManifest({ status: 'SOME_RANDOM_STATUS' })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('defaults null status to OPEN', () => {
    const raw = makeManifest({ status: null })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('parses created, updated, and submittedAt as Date instances', () => {
    const raw = makeManifest()
    const result = transformManifest(raw)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.submittedAt).toBeInstanceOf(Date)
  })

  it('passes raw manifest as metadata', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('passes ManifestSchema.parse without throwing', () => {
    const raw = makeManifest()
    const result = transformManifest(raw)

    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
