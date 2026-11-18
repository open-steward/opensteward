import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  transformManifests,
  type StarshipitManifestEntry,
  type StarshipitManifestResponse,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeEntry(overrides: Partial<StarshipitManifestEntry> = {}): StarshipitManifestEntry {
  return {
    manifest_id: 99,
    carrier_name: 'Australia Post',
    carrier_code: 'auspost',
    order_ids: [1001, 1002, 1003],
    label_count: 3,
    pdf: null,
    url: null,
    created_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<StarshipitManifestResponse> = {},
): StarshipitManifestResponse {
  return {
    success: true,
    manifests: [
      makeEntry(),
      makeEntry({ manifest_id: 100, carrier_code: 'dhl', order_ids: [2001] }),
    ],
    errors: [],
    ...overrides,
  }
}

describe('starshipit transformManifest', () => {
  it('maps id from manifest_id (numeric → string)', () => {
    expect(transformManifest(makeEntry()).id).toBe('99')
  })

  it('falls back id to index when manifest_id is null', () => {
    expect(transformManifest(makeEntry({ manifest_id: null }), 7).id).toBe('7')
  })

  it('maps carrierId from carrier_code', () => {
    expect(transformManifest(makeEntry()).carrierId).toBe('auspost')
  })

  it('falls back carrierId to carrier_name when carrier_code is null', () => {
    expect(transformManifest(makeEntry({ carrier_code: null })).carrierId).toBe('Australia Post')
  })

  it('maps shipmentIds from order_ids as strings', () => {
    const ids = transformManifest(makeEntry()).shipmentIds!
    expect(ids).toEqual(['1001', '1002', '1003'])
  })

  it('returns undefined shipmentIds when order_ids is empty', () => {
    expect(transformManifest(makeEntry({ order_ids: [] })).shipmentIds).toBeUndefined()
  })

  it('maps labelCount', () => {
    expect(transformManifest(makeEntry()).labelCount).toBe(3)
  })

  it('maps status to SUBMITTED', () => {
    expect(transformManifest(makeEntry()).status).toBe('SUBMITTED')
  })

  it('maps submittedAt and createdAt from created_date', () => {
    const r = transformManifest(makeEntry())
    expect(r.submittedAt).toBeInstanceOf(Date)
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeEntry()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('produces schema-valid Manifest', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeEntry()))).not.toThrow()
  })
})

describe('starshipit transformManifests', () => {
  it('maps all entries in manifests array', () => {
    const results = transformManifests(makeResponse())
    expect(results).toHaveLength(2)
    expect(results[0].carrierId).toBe('auspost')
    expect(results[1].carrierId).toBe('dhl')
  })

  it('maps a single manifest from the manifest field when manifests is absent', () => {
    const results = transformManifests(makeResponse({ manifests: null, manifest: makeEntry() }))
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('99')
  })

  it('returns empty array when both manifests and manifest are absent', () => {
    expect(transformManifests({ success: true })).toEqual([])
  })
})
