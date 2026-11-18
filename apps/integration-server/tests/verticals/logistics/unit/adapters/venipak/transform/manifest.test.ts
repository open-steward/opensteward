import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type VenipakManifestResponse,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(overrides: Partial<VenipakManifestResponse> = {}): VenipakManifestResponse {
  return {
    manifest_id: 'MAN-2024-001',
    code: 'MAN-2024-001',
    status: 'open',
    closed: false,
    pack_count: 5,
    label_count: 5,
    created_at: '2024-03-01T00:00:00Z',
    closed_at: null,
    ...overrides,
  }
}

describe('transformManifest (venipak)', () => {
  it('maps id from manifest_id', () => {
    const result = transformManifest(makeManifest())
    expect(result.id).toBe('MAN-2024-001')
  })

  it('falls back id to code when manifest_id is absent', () => {
    const result = transformManifest(makeManifest({ manifest_id: null }))
    expect(result.id).toBe('MAN-2024-001')
  })

  it('falls back id to manifestCode argument when both are absent', () => {
    const result = transformManifest(
      makeManifest({ manifest_id: null, code: null }),
      'CODE-FALLBACK',
    )
    expect(result.id).toBe('CODE-FALLBACK')
  })

  it('hardcodes carrierId to venipak', () => {
    const result = transformManifest(makeManifest())
    expect(result.carrierId).toBe('venipak')
  })

  it('maps status OPEN when closed is false and status is "open"', () => {
    const result = transformManifest(makeManifest({ status: 'open', closed: false }))
    expect(result.status).toBe('OPEN')
  })

  it('maps status CLOSED when closed is true', () => {
    const result = transformManifest(makeManifest({ closed: true }))
    expect(result.status).toBe('CLOSED')
  })

  it('maps status CLOSED when closed is 1', () => {
    const result = transformManifest(makeManifest({ closed: 1 }))
    expect(result.status).toBe('CLOSED')
  })

  it('maps status CLOSED when closed is "1"', () => {
    const result = transformManifest(makeManifest({ closed: '1' }))
    expect(result.status).toBe('CLOSED')
  })

  it('maps status CLOSED when status is "closed"', () => {
    const result = transformManifest(makeManifest({ status: 'closed', closed: false }))
    expect(result.status).toBe('CLOSED')
  })

  it('maps status SUBMITTED when status is "submitted"', () => {
    const result = transformManifest(makeManifest({ status: 'submitted', closed: false }))
    expect(result.status).toBe('SUBMITTED')
  })

  it('maps labelCount from label_count', () => {
    const result = transformManifest(makeManifest({ label_count: 10 }))
    expect(result.labelCount).toBe(10)
  })

  it('falls back labelCount to pack_count when label_count is absent', () => {
    const result = transformManifest(makeManifest({ label_count: null, pack_count: 7 }))
    expect(result.labelCount).toBe(7)
  })

  it('maps createdAt as a Date', () => {
    const result = transformManifest(makeManifest())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps submittedAt from closed_at', () => {
    const result = transformManifest(makeManifest({ closed_at: '2024-03-02T00:00:00Z' }))
    expect(result.submittedAt).toBeInstanceOf(Date)
  })

  it('passes metadata through as raw object', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('passes ManifestSchema.parse without throwing', () => {
    const result = transformManifest(makeManifest())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })
})
