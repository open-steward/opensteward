import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type EnviaManifest,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<EnviaManifest> = {}): EnviaManifest {
  return {
    id: 'mfst-001',
    carrier: 'estafeta',
    manifestNumber: 'MAN-2024-001',
    status: 'submitted',
    shipments: ['TRK001', 'TRK002', 'TRK003'],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformManifest ────────────────────────────────────────────────────────

describe('transformManifest', () => {
  it('maps id, carrierId, manifestNumber', () => {
    const result = transformManifest(makeManifest())
    // raw.id → id, raw.carrier → carrierId — verified in source
    expect(result.id).toBe('mfst-001')
    expect(result.carrierId).toBe('estafeta')
    expect(result.manifestNumber).toBe('MAN-2024-001')
  })

  it('maps shipmentIds and labelCount from shipments array', () => {
    const result = transformManifest(makeManifest())
    // raw.shipments → shipmentIds, length → labelCount — verified in source
    expect(result.shipmentIds).toEqual(['TRK001', 'TRK002', 'TRK003'])
    expect(result.labelCount).toBe(3)
  })

  it('falls back to trackingNumbers when shipments is absent', () => {
    const result = transformManifest(
      makeManifest({ shipments: null, trackingNumbers: ['TN1', 'TN2'] }),
    )
    expect(result.shipmentIds).toEqual(['TN1', 'TN2'])
    expect(result.labelCount).toBe(2)
  })

  it('maps status: submitted → SUBMITTED', () => {
    expect(transformManifest(makeManifest({ status: 'submitted' })).status).toBe('SUBMITTED')
  })

  it('maps status: closed → CLOSED', () => {
    expect(transformManifest(makeManifest({ status: 'closed' })).status).toBe('CLOSED')
  })

  it('maps status: open → OPEN', () => {
    expect(transformManifest(makeManifest({ status: 'open' })).status).toBe('OPEN')
  })

  it('defaults unknown status to OPEN', () => {
    expect(transformManifest(makeManifest({ status: 'SOME_UNKNOWN' })).status).toBe('OPEN')
  })

  it('maps createdAt and updatedAt to Date instances', () => {
    const result = transformManifest(makeManifest())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('parses as ManifestSchema without throwing', () => {
    const result = transformManifest(makeManifest())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
