/**
 * Yousign `GET /signature_requests/{signatureRequestId}/documents` → canonical Document.
 *
 * https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-documents-1.md
 * The 200 response is `{"items":{"$ref":"#/components/schemas/Document"},"type":"array"}`.
 * `Document` documents `id` (example "89120884-d29a-4b1a-ac7b-a9e73a872796"),
 * `filename`, `nature` ("enum":["attachment","signable_document"]),
 * `content_type` (example "application/pdf"), `sha256`, `is_protected`,
 * `is_signed`, `created_at` (example "2024-01-18T22:59:00Z"), `total_pages`
 * ("Number of pages for signable document", nullable), `is_locked`,
 * `initials` (nullable object), `total_anchors`, `excluded_approvers`,
 * `excluded_signers`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawYousignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/yousign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const SR = '9a93d3b5-fb3b-4abf-9e70-26315b33506c'

function documentedDocument(over: Partial<RawYousignDocument> = {}): RawYousignDocument {
  return {
    id: '89120884-d29a-4b1a-ac7b-a9e73a872796',
    filename: 'contract.pdf',
    nature: 'signable_document',
    content_type: 'application/pdf',
    sha256: '4396f6a9f0554928f7bcc8e645a6441cb432c1606137ac8f3a735aef83946974',
    is_protected: false,
    is_signed: true,
    created_at: '2024-01-18T22:59:00Z',
    total_pages: 3,
    is_locked: false,
    initials: null,
    total_anchors: 0,
    excluded_approvers: [],
    excluded_signers: [],
    ...over,
  }
}

describe('Yousign transformDocument', () => {
  it('maps a documented Document to a valid canonical Document', () => {
    const out = DocumentSchema.parse(transformDocument(documentedDocument(), SR, 0))
    expect(out.id).toBe('89120884-d29a-4b1a-ac7b-a9e73a872796')
    expect(out.externalId).toBe(out.id)
    expect(out.envelopeId).toBe(SR)
    expect(out.name).toBe('contract.pdf')
    expect(out.pageCount).toBe(3)
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(0)
    expect(out.metadata).toEqual({
      nature: 'signable_document',
      isSigned: 'true',
      isProtected: 'false',
      sha256: '4396f6a9f0554928f7bcc8e645a6441cb432c1606137ac8f3a735aef83946974',
      createdAt: '2024-01-18T22:59:00.000Z',
    })
  })

  it('an attachment with total_pages: null has no pageCount', () => {
    const out = DocumentSchema.parse(
      transformDocument(documentedDocument({ nature: 'attachment', total_pages: null }), SR, 1),
    )
    expect(out.pageCount).toBeUndefined()
    expect(out.order).toBe(1)
  })

  it('invents no MIME type when content_type is absent', () => {
    const out = DocumentSchema.parse(
      transformDocument(documentedDocument({ content_type: undefined }), SR, 0),
    )
    expect(out.mimeType).toBeUndefined()
  })

  it('invents no filename: a Document without one is refused', () => {
    expect(() => transformDocument(documentedDocument({ filename: undefined }), SR, 0)).toThrow(
      /filename/,
    )
  })
})
