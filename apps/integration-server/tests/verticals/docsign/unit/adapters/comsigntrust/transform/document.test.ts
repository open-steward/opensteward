import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { documentCount, COLLECTION_ID, DOC_ID_1 } from '../fixtures/wesign'

describe('comsigntrust/transform/document (DocumentCountResponseDTO)', () => {
  it('parses against the canonical DocumentSchema', () => {
    const out = DocumentSchema.parse(transformDocument(documentCount(), COLLECTION_ID, 1))
    expect(out.id).toBe(`${COLLECTION_ID}:${DOC_ID_1}`)
    expect(out.externalId).toBe(DOC_ID_1)
    expect(out.envelopeId).toBe(COLLECTION_ID)
    expect(out.name).toBe('lease.pdf')
    expect(out.pageCount).toBe(4)
    expect(out.order).toBe(1)
    expect(out.metadata).toEqual({ templateId: 'aa11bb22-cc33-4d44-8e55-ff6677889900' })
  })

  it('invents no mime type or size: WeSign documents neither', () => {
    const out = DocumentSchema.parse(transformDocument(documentCount(), COLLECTION_ID, 0))
    expect(out.mimeType).toBeUndefined()
    expect(out.sizeBytes).toBeUndefined()
  })

  it('throws on a response without documentId', () => {
    expect(() =>
      transformDocument(documentCount({ documentId: undefined }), COLLECTION_ID, 0),
    ).toThrow(/no documentId/)
  })
})
