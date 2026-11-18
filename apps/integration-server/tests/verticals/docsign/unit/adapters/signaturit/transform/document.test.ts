import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/document'
import type { RawSignaturitDocumentItem } from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { SIGNATURE_OBJECT_EXAMPLE } from './fixtures'

const ENV = SIGNATURE_OBJECT_EXAMPLE.id
const ITEM: RawSignaturitDocumentItem = SIGNATURE_OBJECT_EXAMPLE.documents[0]!

describe('signaturit transformDocument', () => {
  it('maps the documented file information onto the canonical schema', () => {
    const out = DocumentSchema.parse(transformDocument(ITEM, ENV, 0))
    expect(out.id).toBe(`${ENV}:9781f42d-2910-11e4-b3d4-0aa7697eb409`)
    expect(out.externalId).toBe('9781f42d-2910-11e4-b3d4-0aa7697eb409')
    expect(out.envelopeId).toBe(ENV)
    expect(out.name).toBe('document.pdf')
    // "size — The file size" has no documented unit, so it is not sizeBytes.
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBe(5)
    // No MIME type is documented; none is invented.
    expect(out.mimeType).toBeUndefined()
    expect(out.order).toBe(0)
    expect(out.metadata).toEqual({
      status: 'ready',
      signerEmail: 'john@signaturit.com',
      fileSize: '72218',
    })
    expect(out.platform).toBe('signaturit')
  })

  it('refuses a document item without a file name rather than inventing one', () => {
    const { file: _f, ...noFile } = ITEM
    expect(() => transformDocument(noFile as RawSignaturitDocumentItem, ENV, 0)).toThrow(/file/)
  })
})
