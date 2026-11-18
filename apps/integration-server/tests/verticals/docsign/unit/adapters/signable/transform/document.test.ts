import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signable/transform/document'
import type { RawSignableEnvelopeDocument } from '../../../../../../../src/verticals/docsign/adapters/signable/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signable transformDocument', () => {
  it('maps a Signable document to canonical Document', () => {
    const raw: RawSignableEnvelopeDocument = {
      document_fingerprint: 'doc-fp-001',
      document_title: 'Master Services Agreement',
      document_page_total: '12',
    }

    const result = transformDocument(raw, 'env-fp-001', 0)

    // id is composed of envelopeId + document_fingerprint
    expect(result.id).toBe('env-fp-001:doc-fp-001')
    expect(result.externalId).toBe('doc-fp-001')
    expect(result.envelopeId).toBe('env-fp-001')
    expect(result.name).toBe('Master Services Agreement')
    // page count from string
    expect(result.pageCount).toBe(12)
    // Signable always renders to PDF
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signable')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('defaults name to empty string when document_title absent', () => {
    const raw: RawSignableEnvelopeDocument = { document_fingerprint: 'doc-fp-2' }
    const result = transformDocument(raw, 'env-1', 1)
    expect(result.name).toBe('')
    expect(result.pageCount).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
