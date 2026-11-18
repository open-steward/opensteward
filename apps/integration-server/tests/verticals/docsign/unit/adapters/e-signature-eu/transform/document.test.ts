import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/e-signature-eu/transform/document'
import type { RawESignatureEuRequest } from '../../../../../../../src/verticals/docsign/adapters/e-signature-eu/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('e-signature-eu transformDocument', () => {
  it('synthesises a document with .pdf extension from doc_name', () => {
    const raw: RawESignatureEuRequest = {
      id_sign: 42,
      doc_name: 'Contract',
    }
    const result = transformDocument(raw, '42')

    // id is envelopeId + ':doc'
    expect(result.id).toBe('42:doc')
    expect(result.externalId).toBe('42:doc')
    expect(result.envelopeId).toBe('42')
    // doc_name without .pdf gets extension appended
    expect(result.name).toBe('Contract.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('e-signature-eu')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('preserves .pdf extension when already present', () => {
    const raw: RawESignatureEuRequest = {
      id_sign: 10,
      doc_name: 'Agreement.pdf',
    }
    const result = transformDocument(raw, '10')

    // Should not double-append .pdf
    expect(result.name).toBe('Agreement.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name when doc_name is absent', () => {
    const raw: RawESignatureEuRequest = { id_sign: 5 }
    const result = transformDocument(raw, '5')

    // fallback: document-<envelopeId>.pdf
    expect(result.name).toBe('document-5.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('does not expose content or url fields', () => {
    const raw: RawESignatureEuRequest = { id_sign: 1, doc_name: 'Test' }
    const result = transformDocument(raw, '1')

    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })
})
