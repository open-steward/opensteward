/**
 * Fixture: the documented Manifest 200 body (https://docs.karrio.io/reference/openapi,
 * schema Manifest), placeholders replaced by plausible values of the documented types.
 */
import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type KarrioManifest,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeRaw(overrides: Partial<KarrioManifest> = {}): KarrioManifest {
  return {
    id: 'mfst_1',
    object_type: 'manifest',
    carrier_name: 'canadapost',
    carrier_id: 'canadapost-main',
    meta: {},
    test_mode: false,
    address: { person_name: 'Warehouse', country_code: 'CA' },
    options: {},
    reference: 'MAN-2024-03-01',
    shipment_identifiers: ['1Z999AA10123456784', '1Z999AA10123456785'],
    metadata: {},
    manifest_url: 'https://karrio.acme.example/v1/manifests/mfst_1/manifest.pdf',
    messages: [],
    ...overrides,
  }
}

const parse = (raw: KarrioManifest) => ManifestSchema.parse(transformManifest(raw))

describe('karrio transformManifest', () => {
  it('parses with ManifestSchema', () => {
    expect(() => parse(makeRaw())).not.toThrow()
  })

  it('maps id, carrier_id and reference', () => {
    const m = parse(makeRaw())
    expect(m.id).toBe('mfst_1')
    expect(m.carrierId).toBe('canadapost-main')
    expect(m.manifestNumber).toBe('MAN-2024-03-01')
  })

  it('no documented status: none is invented', () => {
    expect(parse(makeRaw()).status).toBeUndefined()
    expect(parse(makeRaw({ manifest_url: null })).status).toBeUndefined()
  })

  it('shipment_identifiers (tracking numbers or carrier ids) are not Shipment ids', () => {
    const m = parse(makeRaw())
    expect(m.shipmentIds).toBeUndefined()
    expect(m.metadata?.['shipment_identifiers']).toEqual([
      '1Z999AA10123456784',
      '1Z999AA10123456785',
    ])
  })

  it('reads no undocumented created_at', () => {
    expect(parse(makeRaw({ created_at: '2024-03-01T00:00:00Z' })).createdAt).toBeUndefined()
  })
})
