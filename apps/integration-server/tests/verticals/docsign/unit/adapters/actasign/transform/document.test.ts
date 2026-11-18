/**
 * actaSIGN portfolio asset → canonical Document (metadata only).
 *
 * Fixture field names and nullability come from the `TenantPortfolio.assets[]`
 * schema in the actaSIGN OpenAPI 3.0.3 document (info.version 3.64.0) served
 * at https://my.actasign.ch/api-docs/ (swagger-ui-init.js). That schema has no
 * examples, so the values (filename "contract.pdf", displayName "Contract",
 * size 123456, numPages 5) are borrowed from the examples on a sibling asset
 * schema in the same spec that declares the same field names.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawActasignAsset,
} from '../../../../../../../src/verticals/docsign/adapters/actasign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const REQ = 'lq0kp480rgm1uiibo6ud1y83'

function asset(over: Partial<RawActasignAsset> = {}): RawActasignAsset {
  return {
    assetUid: 'as0kp480rgm1uiibo6ud1y83',
    clientRef: 'contract',
    context: 'document',
    filename: 'contract.pdf',
    displayName: 'Contract',
    mediaType: 'application/pdf',
    size: 123456,
    numPages: 5,
    numSignatures: 0,
    downloadUrl: 'https://web.actasign.ch/api/v2/portfolios/p/assets/a/download',
    ...over,
  }
}

describe('actasign transformDocument', () => {
  it('maps a documented asset and parses with DocumentSchema', () => {
    const d = DocumentSchema.parse(transformDocument(asset(), REQ, 'pf1', 2))
    expect(d.id).toBe(`${REQ}:as0kp480rgm1uiibo6ud1y83`)
    expect(d.externalId).toBe('as0kp480rgm1uiibo6ud1y83')
    expect(d.envelopeId).toBe(REQ)
    expect(d.name).toBe('contract.pdf')
    expect(d.sizeBytes).toBe(123456)
    expect(d.pageCount).toBe(5)
    expect(d.mimeType).toBe('application/pdf')
    expect(d.order).toBe(2)
    expect(d.metadata).toMatchObject({
      context: 'document',
      displayName: 'Contract',
      portfolioUid: 'pf1',
    })
  })

  it('never carries the download URL (content is refused)', () => {
    const d = transformDocument(asset(), REQ, 'pf1', 0)
    expect(JSON.stringify(d)).not.toContain('download')
  })

  it('nullable fields become undefined and the name falls to displayName', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        asset({ filename: null, size: null, numPages: null, mediaType: null }),
        REQ,
        'pf1',
        0,
      ),
    )
    expect(d.name).toBe('Contract')
    expect(d.sizeBytes).toBeUndefined()
    expect(d.pageCount).toBeUndefined()
    expect(d.mimeType).toBeUndefined()
  })

  it('throws rather than invent a name or id', () => {
    expect(() =>
      transformDocument(asset({ filename: null, displayName: null }), REQ, 'p', 0),
    ).toThrow(/name/)
    expect(() => transformDocument(asset({ assetUid: undefined }), REQ, 'p', 0)).toThrow(/assetUid/)
  })
})
