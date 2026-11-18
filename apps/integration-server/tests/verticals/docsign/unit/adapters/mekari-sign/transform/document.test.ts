import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/document'
import type { RawMekariSignDocument } from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('mekari-sign transformDocument', () => {
  const raw: RawMekariSignDocument = {
    id: 'mek_doc_001',
    filename: 'service-agreement.pdf',
    doc_name: 'Service Agreement',
    title: 'Title Fallback',
    category: 'global',
    signing_status: 'completed',
    stamping_status: 'success',
    page_count: 5,
    size_bytes: 248320,
    size: 200000,
    mime_type: 'application/pdf',
  }

  it('maps id from document id (same as envelopeId)', () => {
    const result = transformDocument(raw)
    expect(result.id).toBe('mek_doc_001')
  })

  it('maps externalId from document id', () => {
    const result = transformDocument(raw)
    expect(result.externalId).toBe('mek_doc_001')
  })

  it('maps envelopeId from document id', () => {
    const result = transformDocument(raw)
    expect(result.envelopeId).toBe('mek_doc_001')
  })

  it('maps name from filename field', () => {
    const result = transformDocument(raw)
    expect(result.name).toBe('service-agreement.pdf')
  })

  it('falls back to doc_name when filename is absent', () => {
    const result = transformDocument({ ...raw, filename: undefined })
    expect(result.name).toBe('Service Agreement')
  })

  it('falls back to title when filename and doc_name are absent', () => {
    const result = transformDocument({ ...raw, filename: undefined, doc_name: undefined })
    expect(result.name).toBe('Title Fallback')
  })

  it('maps sizeBytes from size_bytes', () => {
    const result = transformDocument(raw)
    expect(result.sizeBytes).toBe(248320)
  })

  it('falls back to size when size_bytes is absent', () => {
    const result = transformDocument({ ...raw, size_bytes: undefined })
    expect(result.sizeBytes).toBe(200000)
  })

  it('maps pageCount from page_count', () => {
    const result = transformDocument(raw)
    expect(result.pageCount).toBe(5)
  })

  it('maps mimeType from mime_type', () => {
    const result = transformDocument(raw)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('defaults mimeType to application/pdf when mime_type is absent', () => {
    const result = transformDocument({ ...raw, mime_type: undefined })
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order to 0 (always first and only document per Mekari envelope)', () => {
    const result = transformDocument(raw)
    expect(result.order).toBe(0)
  })

  it('sets platform to mekari-sign', () => {
    const result = transformDocument(raw)
    expect(result.platform).toBe('mekari-sign')
  })

  it('includes category and stampingStatus in metadata', () => {
    const result = transformDocument(raw)
    expect(result.metadata.category).toBe('global')
    expect(result.metadata.stampingStatus).toBe('success')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
