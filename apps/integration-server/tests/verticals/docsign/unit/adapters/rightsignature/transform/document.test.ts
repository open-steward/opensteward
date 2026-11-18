import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/rightsignature/transform/document'
import { SHOW_DOCUMENT } from '../fixtures'

const DOC_ID = SHOW_DOCUMENT.document.id

describe('RightSignature transformDocument (documents show)', () => {
  it('maps the documented file metadata onto the canonical Document', () => {
    const out = DocumentSchema.parse(transformDocument(SHOW_DOCUMENT.document))
    expect(out).toMatchObject({
      id: `${DOC_ID}:${DOC_ID}`,
      externalId: DOC_ID,
      envelopeId: DOC_ID,
      name: 'application.pdf',
      order: 0,
      platform: 'rightsignature',
      metadata: { document_name: 'Test' },
    })
  })

  it('emits no size, page count or MIME type: none is documented', () => {
    const out = DocumentSchema.parse(transformDocument(SHOW_DOCUMENT.document))
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
  })

  it('copies no file URL into raw', () => {
    const out = transformDocument(SHOW_DOCUMENT.document)
    expect(JSON.stringify(out)).not.toContain('s3.amazonaws.com')
  })

  it('throws when the documented filename is missing', () => {
    expect(() => transformDocument({ id: DOC_ID, name: 'Test' })).toThrow(/no filename/)
  })

  it('throws when the document id is missing', () => {
    expect(() => transformDocument({ id: '', filename: 'application.pdf' })).toThrow(/no id/)
  })
})
