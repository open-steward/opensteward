import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawZorrosignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/zorrosign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('ZorroSign transformDocument', () => {
  it('maps a fully-populated document to the canonical Document shape', () => {
    const raw: RawZorrosignDocument = {
      document_id: 'zdoc_001',
      name: 'nda.pdf',
      mime_type: 'application/pdf',
      size: 102400,
      page_count: 3,
      order: 0,
    }
    const result = transformDocument(raw, 'pkg_env001', 0)

    // id is "<envelopeId>:<document_id>"
    expect(result.id).toBe('pkg_env001:zdoc_001')
    expect(result.externalId).toBe('zdoc_001')
    expect(result.envelopeId).toBe('pkg_env001')
    expect(result.name).toBe('nda.pdf')
    expect(result.sizeBytes).toBe(102400)
    expect(result.pageCount).toBe(3)
    expect(result.mimeType).toBe('application/pdf')
    // order from raw.order
    expect(result.order).toBe(0)
    expect(result.platform).toBe('zorrosign')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to file_name and content_type when name/mime_type are absent', () => {
    const raw: RawZorrosignDocument = {
      document_id: 'zdoc_002',
      file_name: 'report.docx',
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_size: '204800',
    }
    const result = transformDocument(raw, 'pkg_env002', 1)

    expect(result.name).toBe('report.docx')
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    // file_size as string → coerced to number
    expect(result.sizeBytes).toBe(204800)
    // no raw.order → falls back to index argument
    expect(result.order).toBe(1)

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('outputs empty name when both name and file_name are absent', () => {
    const raw: RawZorrosignDocument = { document_id: 'zdoc_003' }
    const result = transformDocument(raw, 'pkg_env003', 2)

    expect(result.name).toBe('')
    expect(result.mimeType).toBeUndefined()
    expect(result.sizeBytes).toBeUndefined()

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
