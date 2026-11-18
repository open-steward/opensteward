import { describe, it, expect } from 'vitest'
import {
  transformManifestFromDocument,
  transformManifestFromHistory,
  extractManifestHistory,
  type SpApiCollectionFormResponse,
  type SpApiCollectionFormsHistoryRecord,
} from '../../../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

/**
 * Amazon's manifest is the "collection form". The history endpoint
 * (`PUT /shipping/v2/collectionForms/history`) lists them; generate/get
 * return only the PDF document, with no id or carrier in the body.
 *
 * The history fixture is the spec's own example — note `COMPLETED` where the
 * enum says `Completed`, and an epoch-millisecond `creationDate` where the
 * type says string. Both are what a real response may carry.
 */
function makeHistoryRecord(
  overrides: Partial<SpApiCollectionFormsHistoryRecord> = {},
): SpApiCollectionFormsHistoryRecord {
  return {
    carrierName: 'USPS',
    creationDate: 1650163712052,
    generationStatus: 'COMPLETED',
    collectionFormId: '2c631e32-2538-3431-889e-008b6f5a6f11',
    shipFromAddress: {
      name: 'Acme Seattle',
      addressLine1: '400 Pine St',
      city: 'Seattle',
      stateOrRegion: 'WA',
      postalCode: '98101',
      countryCode: 'US',
    },
    ...overrides,
  }
}

function makeDocument(
  overrides: Partial<SpApiCollectionFormResponse> = {},
): SpApiCollectionFormResponse {
  return {
    collectionsFormDocument: {
      base64EncodedContent: 'VGhpcyBpcyBzb21lIHRleHQgdG8gY29udmVydCB2aWEgQ3J5cHQu',
      documentFormat: 'application/pdf',
    },
    ...overrides,
  }
}

describe('amazon-sp-api transformManifestFromHistory', () => {
  it('maps id, carrier and created date', () => {
    const m = transformManifestFromHistory(makeHistoryRecord())
    expect(m.id).toBe('2c631e32-2538-3431-889e-008b6f5a6f11')
    expect(m.carrierId).toBe('USPS')
    expect(m.createdAt).toEqual(new Date(1650163712052))
  })

  it('accepts an ISO creation date as well as epoch milliseconds', () => {
    const m = transformManifestFromHistory(
      makeHistoryRecord({ creationDate: '2022-04-17T02:48:32.052Z' }),
    )
    expect(m.createdAt).toEqual(new Date('2022-04-17T02:48:32.052Z'))
  })

  it('prefers carrierId over carrierName when a response carries both', () => {
    const m = transformManifestFromHistory(makeHistoryRecord({ carrierId: 'usps-acct' }))
    expect(m.carrierId).toBe('usps-acct')
  })

  it.each([
    ['Completed', 'SUBMITTED'],
    ['COMPLETED', 'SUBMITTED'],
    ['InProgress', 'OPEN'],
    ['INPROGRESS', 'OPEN'],
    ['Failed', 'unknown'],
    [undefined, 'unknown'],
  ])('maps generationStatus %s → %s', (raw, expected) => {
    expect(transformManifestFromHistory(makeHistoryRecord({ generationStatus: raw })).status).toBe(
      expected,
    )
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeHistoryRecord()
    expect(transformManifestFromHistory(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() =>
      ManifestSchema.parse(transformManifestFromHistory(makeHistoryRecord())),
    ).not.toThrow()
  })

  it('parses a sparse record too', () => {
    expect(ManifestSchema.safeParse(transformManifestFromHistory({})).success).toBe(true)
  })
})

describe('amazon-sp-api transformManifestFromDocument', () => {
  it('takes the id from the caller, since the body has none', () => {
    const m = transformManifestFromDocument(makeDocument(), 'cf-123')
    expect(m.id).toBe('cf-123')
  })

  it('takes the carrier from the caller, since the body has none', () => {
    const m = transformManifestFromDocument(makeDocument(), undefined, 'UPS')
    expect(m.carrierId).toBe('UPS')
  })

  it('leaves id and carrier undefined when the caller has neither', () => {
    const m = transformManifestFromDocument(makeDocument())
    expect(m.id).toBeUndefined()
    expect(m.carrierId).toBeUndefined()
  })

  it('reports SUBMITTED, because a returned document means generation finished', () => {
    expect(transformManifestFromDocument(makeDocument()).status).toBe('SUBMITTED')
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeDocument()
    expect(transformManifestFromDocument(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() =>
      ManifestSchema.parse(transformManifestFromDocument(makeDocument(), 'cf-123', 'UPS')),
    ).not.toThrow()
  })
})

describe('amazon-sp-api extractManifestHistory', () => {
  it('unwraps collectionFormsHistoryRecordList', () => {
    const rows = [makeHistoryRecord()]
    expect(extractManifestHistory({ collectionFormsHistoryRecordList: rows })).toBe(rows)
  })

  it('yields nothing to iterate when the list is absent', () => {
    expect(extractManifestHistory({})).toEqual([])
    expect(extractManifestHistory({ collectionFormsHistoryRecordList: null })).toEqual([])
  })
})
