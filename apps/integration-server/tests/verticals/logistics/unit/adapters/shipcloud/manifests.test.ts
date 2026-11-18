/**
 * shipcloud manifests. The first-party OpenAPI spec
 * (https://developers.shipcloud.io/downloads/api/oai/shipcloud_v1_oai3.json)
 * declares only two manifest operations:
 *   "/manifests": { "post": { "description": "Create a manifest" } }
 *   "/manifests/{id}": { "get": { "description": "Getting information about a manifest" } }
 * There is no GET /manifests, so listManifests refuses with 501 before sending
 * anything, and getManifest reads GET /manifests/{id}.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipcloudAdapter } from '../../../../../../src/verticals/logistics/adapters/shipcloud/index'
import { ManifestSchema } from '../../../../../../src/verticals/logistics/schema/manifest'

const CREDS = { accessToken: 'key-a' }

/** The documented manifest_response_example from the OpenAPI spec. */
const MANIFEST_RESPONSE = {
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
}

/** A fake shipcloud that serves only the documented GET /manifests/{id}. */
function fakeShipcloud() {
  const get = vi.fn(async (path: string) => {
    const m = /^manifests\/([^/]+)$/.exec(path)
    if (m && m[1] === MANIFEST_RESPONSE.id) return { data: MANIFEST_RESPONSE }
    throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
  })
  const post = vi.fn()
  const del = vi.fn()
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post,
    delete: del,
  })) as unknown as typeof axios.create)
  return { get, post, del }
}

afterEach(() => vi.restoreAllMocks())

describe('shipcloud listManifests', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post, del } = fakeShipcloud()
    const adapter = new ShipcloudAdapter()
    await expect(adapter.listManifests(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(axios.create).not.toHaveBeenCalled()
  })
})

describe('shipcloud getManifest', () => {
  it('reads GET /manifests/{id} and maps the documented response', async () => {
    const { get } = fakeShipcloud()
    const adapter = new ShipcloudAdapter()
    const manifest = await adapter.getManifest(CREDS, MANIFEST_RESPONSE.id)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[0]).toBe(`manifests/${MANIFEST_RESPONSE.id}`)
    const parsed = ManifestSchema.parse(manifest)
    expect(parsed.id).toBe(MANIFEST_RESPONSE.id)
    expect(parsed.shipmentIds).toEqual(MANIFEST_RESPONSE.shipments)
  })
})
