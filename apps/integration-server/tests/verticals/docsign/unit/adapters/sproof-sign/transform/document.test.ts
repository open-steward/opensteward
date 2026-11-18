import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/document'
import { DOCUMENT_EXAMPLE } from '../fixtures'

/** A sproof `_Document` is one file: `id` "Document ID", `name` "Document name". */
describe('sproof-sign transformDocument', () => {
  it('maps the documented _Document example and parses with DocumentSchema', () => {
    const out = DocumentSchema.parse(transformDocument(DOCUMENT_EXAMPLE, 'env1'))
    expect(out.id).toBe(`env1:${DOCUMENT_EXAMPLE.id}`)
    expect(out.externalId).toBe(DOCUMENT_EXAMPLE.id)
    expect(out.envelopeId).toBe('env1')
    expect(out.name).toBe('important_contract')
    expect(out.order).toBe(0)
    // The spec documents no size, page count or MIME type on _Document.
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
    expect(out.platform).toBe('sproof-sign')
  })

  it('throws rather than invent an id when the document id is missing', () => {
    expect(() => transformDocument({ ...DOCUMENT_EXAMPLE, id: undefined }, 'env1')).toThrow(
      /document id/,
    )
  })
})
