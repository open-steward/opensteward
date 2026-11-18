import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type FedExEndOfDayOutput,
} from '../../../../../../../src/verticals/logistics/adapters/fedex/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

/**
 * FedEx's manifest is the Ground End of Day Close: `PUT /ship/v1/endofday/`
 * with `closeReqType: 'GCDR'` closes every open Ground shipment on the
 * account for a date and hands back the close reports. The response is
 * `output.closeDocuments[]` — report images, not shipments — so the
 * canonical record is synthesised from the close date, and the fields the
 * response cannot populate are left undefined rather than echoed from the
 * request.
 */

/** EndOfDayCloseOutputVO, per the published Close API spec. */
function makeOutput(overrides: Partial<FedExEndOfDayOutput> = {}): FedExEndOfDayOutput {
  return {
    alerts: [],
    closeDocuments: [
      {
        type: 'OP_950',
        shippingCycle: '1003234523333204',
        shippingDocumentDisposition: 'CONFIRMED',
        resolution: 200,
        copiesToPrint: 1,
        parts: [{ documentPartSequenceNumber: 1, image: 'JVBERi0xLjQK' }],
      },
    ],
    ...overrides,
  }
}

const CLOSE_DATE = '2026-09-12'

describe('fedex transformManifest', () => {
  it('synthesises the id from the close date', () => {
    expect(transformManifest(makeOutput(), CLOSE_DATE).id).toBe('eod-2026-09-12')
  })

  it('is always CLOSED — the endpoint is the close', () => {
    expect(transformManifest(makeOutput(), CLOSE_DATE).status).toBe('CLOSED')
  })

  it('carries fedex as the carrier', () => {
    expect(transformManifest(makeOutput(), CLOSE_DATE).carrierId).toBe('fedex')
  })

  it('takes manifestNumber from the shipping cycle', () => {
    expect(transformManifest(makeOutput(), CLOSE_DATE).manifestNumber).toBe('1003234523333204')
  })

  it('reads the shipping cycle from whichever document carries one', () => {
    const output = makeOutput({
      closeDocuments: [
        { type: 'MANIFEST', shippingCycle: null },
        { type: 'OP_950', shippingCycle: '2003234523333205' },
      ],
    })
    expect(transformManifest(output, CLOSE_DATE).manifestNumber).toBe('2003234523333205')
  })

  it('omits manifestNumber when no document carries a shipping cycle', () => {
    const output = makeOutput({ closeDocuments: [{ type: 'OP_950' }] })
    expect(transformManifest(output, CLOSE_DATE).manifestNumber).toBeUndefined()
  })

  it('leaves shipmentIds and labelCount undefined — the close names no tracking numbers', () => {
    // GCDR closes the whole day; nothing in the request or the response
    // enumerates the shipments, so any value here would be fabricated.
    const m = transformManifest(makeOutput(), CLOSE_DATE)
    expect(m.shipmentIds).toBeUndefined()
    expect(m.labelCount).toBeUndefined()
  })

  it('dates submittedAt and createdAt from the close date', () => {
    const m = transformManifest(makeOutput(), CLOSE_DATE)
    expect(m.submittedAt).toBeInstanceOf(Date)
    expect(m.submittedAt?.toISOString().slice(0, 10)).toBe(CLOSE_DATE)
    expect(m.createdAt?.toISOString().slice(0, 10)).toBe(CLOSE_DATE)
  })

  it('preserves the raw output by reference', () => {
    const raw = makeOutput()
    expect(transformManifest(raw, CLOSE_DATE).metadata).toBe(raw)
  })

  it('keeps the report image reachable through metadata', () => {
    // ManifestSchema has no document field; the base64 report is the one
    // thing the close actually returns, so it must not be lost.
    const m = transformManifest(makeOutput(), CLOSE_DATE)
    const docs = (m.metadata as FedExEndOfDayOutput).closeDocuments
    expect(docs?.[0]?.parts?.[0]?.image).toBe('JVBERi0xLjQK')
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeOutput(), CLOSE_DATE))).not.toThrow()
  })

  it('parses a sparse output too', () => {
    const sparse = {} as FedExEndOfDayOutput
    expect(ManifestSchema.safeParse(transformManifest(sparse, CLOSE_DATE)).success).toBe(true)
  })
})
