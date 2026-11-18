import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawXodoSignFile,
} from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('xodo-sign transformDocument', () => {
  it('maps a Xodo Sign file to canonical Document', () => {
    const raw: RawXodoSignFile = {
      file_id: 'file-abc',
      name: 'contract.pdf',
      pages: 12,
    }

    const result = transformDocument(raw, 'doc-hash', 0)

    expect(result.id).toBe('doc-hash:file-abc')
    expect(result.externalId).toBe('file-abc')
    expect(result.envelopeId).toBe('doc-hash')
    expect(result.name).toBe('contract.pdf')
    expect(result.pageCount).toBe(12)
    // Xodo Sign is always PDF
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('xodo-sign')
    expect(result.metadata.fileId).toBe('file-abc')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to index as externalId when file_id absent', () => {
    const raw: RawXodoSignFile = { name: 'annex.pdf', pages: 3 }
    const result = transformDocument(raw, 'doc-hash', 2)
    expect(result.externalId).toBe('2')
    expect(result.id).toBe('doc-hash:2')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name when name absent', () => {
    const raw: RawXodoSignFile = { file_id: 'f1' }
    const result = transformDocument(raw, 'doc-hash', 1)
    expect(result.name).toBe('document-1')
  })

  it('produces undefined pageCount when pages absent', () => {
    const raw: RawXodoSignFile = { file_id: 'f2', name: 'doc.pdf' }
    const result = transformDocument(raw, 'doc-hash', 0)
    expect(result.pageCount).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
