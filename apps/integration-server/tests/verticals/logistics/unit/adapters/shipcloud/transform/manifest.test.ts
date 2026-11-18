/**
 * shipcloud manifest_response -> canonical Manifest. The fixture is the
 * documented manifest_response_example from the first-party OpenAPI spec
 * (https://developers.shipcloud.io/downloads/api/oai/shipcloud_v1_oai3.json).
 * The response schema documents id, carrier, carrier_reference_number,
 * posting_hub_address, shipments ("array of shipment IDs that are send using
 * this manifest"), reference_number, documents and created_at. It documents no
 * status and no updated_at.
 */
import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ShipcloudManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(overrides: Partial<ShipcloudManifest> = {}): ShipcloudManifest {
  return {
    id: '3a186c51d4281acbecf5ed38805b1db92a9d668b',
    carrier: 'asendia',
    carrier_reference_number: '1313252761',
    posting_hub_address: {
      id: 'ce76939d-1a32-4185-8467-a5dafbdf99f2',
      company: 'Muster-Company',
      first_name: 'Max',
      last_name: 'Mustermann',
      care_of: null,
      street: 'Musterstraße',
      street_no: '42',
      zip_code: '54321',
      city: 'Musterstadt',
      state: null,
      country: 'DE',
      email: 'max@mustermann.baz',
      phone: '+491234567890',
    },
    shipments: [
      'c3c25a8786c89341601b131d6ed7f5d80af8aaef',
      '4dfcc1b3a5e764d139b1c9e6492e018928071b4f',
    ],
    reference_number: '12345ABCDE',
    documents: [
      {
        identifier: 'manifest_document',
        document_url:
          'https://documents.shipcloud.io/manifests/1234567e-3f98-9876-907f-50de20200c2e/manifest_documents/manifest_document',
      },
    ],
    created_at: '2021-05-06T10:43:04Z',
    ...overrides,
  }
}

describe('transformManifest (shipcloud)', () => {
  it('parses the documented example with ManifestSchema', () => {
    const result = ManifestSchema.parse(transformManifest(makeManifest()))
    expect(result).toMatchObject({
      id: '3a186c51d4281acbecf5ed38805b1db92a9d668b',
      carrierId: 'asendia',
      manifestNumber: '1313252761',
      shipmentIds: [
        'c3c25a8786c89341601b131d6ed7f5d80af8aaef',
        '4dfcc1b3a5e764d139b1c9e6492e018928071b4f',
      ],
    })
    expect(result.createdAt).toEqual(new Date('2021-05-06T10:43:04Z'))
  })

  it('maps manifestNumber from carrier_reference_number, not the id', () => {
    expect(
      transformManifest(makeManifest({ carrier_reference_number: 'REF-9' })).manifestNumber,
    ).toBe('REF-9')
  })

  it('maps shipmentIds from the documented shipments array', () => {
    expect(transformManifest(makeManifest({ shipments: ['a', 'b', 'c'] })).shipmentIds).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('omits shipmentIds when shipments is empty', () => {
    expect(transformManifest(makeManifest({ shipments: [] })).shipmentIds).toBeUndefined()
  })

  it('leaves undocumented fields unset: status, updatedAt, labelCount', () => {
    const result = transformManifest(makeManifest())
    expect(result.status).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
    expect(result.labelCount).toBeUndefined()
  })

  it('maps the documented example to exactly the documented fields and nothing else', () => {
    const raw = makeManifest()
    expect(transformManifest(raw)).toStrictEqual({
      id: '3a186c51d4281acbecf5ed38805b1db92a9d668b',
      carrierId: 'asendia',
      manifestNumber: '1313252761',
      shipmentIds: [
        'c3c25a8786c89341601b131d6ed7f5d80af8aaef',
        '4dfcc1b3a5e764d139b1c9e6492e018928071b4f',
      ],
      createdAt: new Date('2021-05-06T10:43:04Z'),
      metadata: raw,
    })
  })

  it('passes the raw response as metadata', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })
})
