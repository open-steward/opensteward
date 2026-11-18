/**
 * DigiSigner signature request document → canonical Document.
 *
 * Source: https://www.digisigner.com/esignature-api/esignature-api-documentation/
 * "documents[] array Array of documents in this signature request
 *  ├ document_id string Document id". The Send Signature Request section adds
 * "The response parameters duplicate the request parameters", which include
 * "title (optional) string Title under which the document will be sent to signers".
 */
import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/digisigner/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { documentedSignatureRequest, DOC_DOCUMENT_ID, DOC_REQ_ID } from '../fixture'

describe('digisigner transformDocument', () => {
  it('maps the documented sample document and parses with DocumentSchema', () => {
    const raw = documentedSignatureRequest().documents![0]!
    const d = DocumentSchema.parse(transformDocument(raw, DOC_REQ_ID, 0))
    expect(d.id).toBe(`${DOC_REQ_ID}:${DOC_DOCUMENT_ID}`)
    expect(d.externalId).toBe(DOC_DOCUMENT_ID)
    expect(d.envelopeId).toBe(DOC_REQ_ID)
    expect(d.order).toBe(0)
    expect(d.name).toBe('')
    expect(d.mimeType).toBeUndefined()
    expect(d.platform).toBe('digisigner')
    expect(JSON.stringify(d.raw)).not.toContain('sign_document_url')
  })

  it('reads the echoed request `title` as the name', () => {
    const raw = { ...documentedSignatureRequest().documents![0]!, title: 'NDA for James Williams' }
    expect(DocumentSchema.parse(transformDocument(raw, DOC_REQ_ID, 1)).name).toBe(
      'NDA for James Williams',
    )
  })

  it('throws when document_id is missing', () => {
    expect(() => transformDocument({ signers: [] }, DOC_REQ_ID, 0)).toThrow(/document_id/)
  })
})
