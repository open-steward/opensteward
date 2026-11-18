import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawEsignlyDocument,
} from '../../../../../../../src/verticals/docsign/adapters/esignly/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('esignly transformDocument', () => {
  it('maps a document with all fields present', () => {
    const raw: RawEsignlyDocument = {
      document_id: 'doc-xyz',
      name: 'Employment Contract.pdf',
      mime_type: 'application/pdf',
      size: 102400,
      page_count: 5,
      order: 0,
    }
    const result = transformDocument(raw, 'env-001', 0)

    expect(result.id).toBe('env-001:doc-xyz')
    expect(result.externalId).toBe('doc-xyz')
    expect(result.envelopeId).toBe('env-001')
    expect(result.name).toBe('Employment Contract.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.sizeBytes).toBe(102400)
    expect(result.pageCount).toBe(5)
    expect(result.order).toBe(0)
    expect(result.platform).toBe('esignly')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to doc_id when document_id is absent', () => {
    const raw: RawEsignlyDocument = {
      doc_id: 'alt-doc-id',
      file_name: 'agreement.pdf',
      content_type: 'application/pdf',
    }
    const result = transformDocument(raw, 'env-002', 1)

    expect(result.externalId).toBe('alt-doc-id')
    expect(result.id).toBe('env-002:alt-doc-id')
    // file_name fallback for name
    expect(result.name).toBe('agreement.pdf')
    // content_type fallback for mimeType
    expect(result.mimeType).toBe('application/pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to index when both ids are absent', () => {
    const raw: RawEsignlyDocument = { name: 'doc.pdf' }
    const result = transformDocument(raw, 'env-003', 3)

    expect(result.externalId).toBe('3')
    expect(result.id).toBe('env-003:3')
    expect(result.order).toBe(3)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses file_size and pages as fallbacks for sizeBytes and pageCount', () => {
    const raw: RawEsignlyDocument = {
      document_id: 'doc-abc',
      name: 'report.pdf',
      file_size: '204800',
      pages: '10',
    }
    const result = transformDocument(raw, 'env-004', 0)

    expect(result.sizeBytes).toBe(204800)
    expect(result.pageCount).toBe(10)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('defaults mimeType to application/pdf when both mime fields absent', () => {
    const raw: RawEsignlyDocument = { document_id: 'doc-no-mime', name: 'test.pdf' }
    const result = transformDocument(raw, 'env-005', 0)

    expect(result.mimeType).toBe('application/pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('does not expose content or url fields', () => {
    const raw: RawEsignlyDocument = { document_id: 'doc-1', name: 'test.pdf' }
    const result = transformDocument(raw, 'env-006', 0)

    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })
})
