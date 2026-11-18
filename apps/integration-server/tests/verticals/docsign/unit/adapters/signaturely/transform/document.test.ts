import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSignaturelyPart,
} from '../../../../../../../src/verticals/docsign/adapters/signaturely/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signaturely transformDocument', () => {
  it('maps a PDF part to canonical Document with inferred mimeType', () => {
    const raw: RawSignaturelyPart = {
      id: 'part-001',
      order: 0,
      originalFileName: 'contract.pdf',
    }
    const result = transformDocument(raw, 'env-1', 0)

    expect(result.id).toBe('part-001')
    expect(result.externalId).toBe('part-001')
    expect(result.envelopeId).toBe('env-1')
    expect(result.name).toBe('contract.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signaturely')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('maps a docx part with correct MIME type', () => {
    const raw: RawSignaturelyPart = {
      id: 'part-002',
      order: 1,
      originalFileName: 'agreement.docx',
    }
    const result = transformDocument(raw, 'env-1', 1)

    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to index-based id and name when raw fields are absent', () => {
    const raw: RawSignaturelyPart = {}
    const result = transformDocument(raw, 'env-2', 3)

    expect(result.id).toBe('env-2:3')
    expect(result.name).toBe('document-3')
    expect(result.mimeType).toBeUndefined()
    expect(result.order).toBe(3)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
