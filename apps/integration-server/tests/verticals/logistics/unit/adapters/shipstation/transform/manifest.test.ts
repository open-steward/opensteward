import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type SSManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shipstation/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

/**
 * Nothing in the adapter calls this transform. ShipStation API v1 has no
 * manifest operation, and `createManifest` — which POSTed a route that appears
 * in no ShipStation spec — was removed on that basis; the Manifests block in
 * adapters/shipstation/index.ts carries the V1 spec URL and the 2026-09-13
 * probe. The transform is kept as the landing spot for a future v2
 * `POST /v2/manifests` client, so this pins what it does today. The fixture
 * is the transform's own v1/v2-blended field set, not a captured response —
 * there is no endpoint to capture one from.
 */
function makeManifest(overrides: Partial<SSManifest> = {}): SSManifest {
  return {
    manifestId: 4815162,
    form: 'https://ssapi.shipstation.com/manifests/4815162.pdf',
    createDate: '2026-09-12T17:03:44.0000000',
    shipDate: '2026-09-12',
    carrierId: 6886508,
    carrierCode: 'stamps_com',
    warehouseId: 12345,
    shipmentIds: [110001, 110002, 110003],
    ...overrides,
  }
}

describe('shipstation transformManifest', () => {
  it('stringifies the numeric manifestId', () => {
    const m = transformManifest(makeManifest())
    expect(m.id).toBe('4815162')
    expect(typeof m.id).toBe('string')
  })

  it('prefers carrierCode over the numeric carrierId', () => {
    // carrierCode is what every other ShipStation resource joins on
    // (createLabel sends it as carrierCode); the numeric id is only a fallback.
    expect(transformManifest(makeManifest()).carrierId).toBe('stamps_com')
  })

  it('falls back to the stringified numeric carrierId when carrierCode is absent', () => {
    expect(transformManifest(makeManifest({ carrierCode: null })).carrierId).toBe('6886508')
  })

  it('stringifies warehouseId', () => {
    expect(transformManifest(makeManifest()).warehouseId).toBe('12345')
  })

  it('stringifies every shipmentId', () => {
    expect(transformManifest(makeManifest()).shipmentIds).toEqual(['110001', '110002', '110003'])
  })

  it('falls back to labelIds when shipmentIds is absent', () => {
    const m = transformManifest(
      makeManifest({ shipmentIds: null, labelIds: ['se-lbl-1', 'se-lbl-2'] }),
    )
    expect(m.shipmentIds).toEqual(['se-lbl-1', 'se-lbl-2'])
  })

  it('leaves shipmentIds undefined when neither list is present', () => {
    const m = transformManifest(makeManifest({ shipmentIds: null, labelIds: null }))
    expect(m.shipmentIds).toBeUndefined()
  })

  describe('status mapping', () => {
    // There is no raw status field: the transform reads the presence of the
    // PDF `form` URL as "submitted" and its absence as "still open".
    it('is SUBMITTED when a form URL is present', () => {
      expect(transformManifest(makeManifest()).status).toBe('SUBMITTED')
    })

    it('is OPEN when the form URL is null', () => {
      expect(transformManifest(makeManifest({ form: null })).status).toBe('OPEN')
    })

    it('is OPEN when the form URL is absent entirely', () => {
      const { form: _form, ...withoutForm } = makeManifest()
      expect(transformManifest(withoutForm).status).toBe('OPEN')
    })
  })

  it('parses the v1-style 7-digit-fraction createDate into a Date for both timestamps', () => {
    // ShipStation v1 timestamps carry no zone suffix, so `new Date` reads them
    // in the process's local zone; the exact instant is deliberately not
    // pinned here (it would differ between a UTC container and a laptop).
    const m = transformManifest(makeManifest())
    expect(m.createdAt).toBeInstanceOf(Date)
    expect(Number.isNaN(m.createdAt?.getTime())).toBe(false)
    expect(m.submittedAt).toEqual(m.createdAt)
  })

  it('leaves both timestamps undefined when createDate is missing', () => {
    const m = transformManifest(makeManifest({ createDate: null }))
    expect(m.createdAt).toBeUndefined()
    expect(m.submittedAt).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeManifest()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })

  it('parses a sparse manifest too', () => {
    // Every raw field is optional, so an empty object must still yield a
    // schema-valid (if empty) manifest rather than throwing.
    expect(ManifestSchema.safeParse(transformManifest({})).success).toBe(true)
  })
})
