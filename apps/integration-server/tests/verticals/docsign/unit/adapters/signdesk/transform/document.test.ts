import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/document'
import type { RawSigndeskDocumentFile } from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signdesk transformDocument', () => {
  it('maps a document file with all metadata fields to canonical Document', () => {
    const raw: RawSigndeskDocumentFile = {
      document_id: 'doc-001',
      document_name: 'Lease Agreement',
      file_name: 'lease.pdf',
      page_count: 5,
      size_bytes: 102400,
      content_type: 'application/pdf',
    }
    const result = transformDocument(raw, 'env-1', 0)

    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('env-1')
    expect(result.name).toBe('Lease Agreement')
    expect(result.pageCount).toBe(5)
    expect(result.sizeBytes).toBe(102400)
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signdesk')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to file_name when document_name is absent', () => {
    const raw: RawSigndeskDocumentFile = {
      document_id: 'doc-002',
      file_name: 'annex.pdf',
    }
    const result = transformDocument(raw, 'env-1', 1)

    expect(result.name).toBe('annex.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to index-based id and defaults when minimal input given', () => {
    const raw: RawSigndeskDocumentFile = {}
    const result = transformDocument(raw, 'env-2', 2)

    expect(result.id).toBe('env-2:2')
    // Default mimeType is 'application/pdf'
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(2)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
