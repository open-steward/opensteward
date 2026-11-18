import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawTilakaPdf,
} from '../../../../../../../src/verticals/docsign/adapters/tilaka/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('tilaka transformDocument', () => {
  const raw: RawTilakaPdf = {
    filename: 'contract.pdf',
    document_name: 'Contract',
    pages: 10,
    size: 204800,
    signatures: [
      { user_identifier: 'user-a', page_number: 2 },
      { user_identifier: 'user-b', page_number: 5 },
    ],
  }

  it('composes id from envelopeId and filename', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.id).toBe('req-001:contract.pdf')
  })

  it('sets externalId to filename', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.externalId).toBe('contract.pdf')
  })

  it('sets name to filename', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.name).toBe('contract.pdf')
  })

  it('preserves envelopeId', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.envelopeId).toBe('req-001')
  })

  it('preserves order', () => {
    const result = transformDocument(raw, 'req-001', 3)
    expect(result.order).toBe(3)
  })

  it('maps size to sizeBytes', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.sizeBytes).toBe(204800)
  })

  it('maps pages to pageCount', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.pageCount).toBe(10)
  })

  it('sets mimeType to application/pdf', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets platform to tilaka', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.platform).toBe('tilaka')
  })

  it('falls back to document_name when filename is absent', () => {
    const noFilename: RawTilakaPdf = { ...raw, filename: undefined, document_name: 'Contract' }
    const result = transformDocument(noFilename, 'req-001', 0)
    expect(result.externalId).toBe('Contract')
    expect(result.name).toBe('Contract')
  })

  it('falls back to String(order) as externalId when both filename and document_name absent', () => {
    const noName: RawTilakaPdf = { ...raw, filename: undefined, document_name: undefined }
    const result = transformDocument(noName, 'req-001', 7)
    expect(result.externalId).toBe('7')
  })

  it('falls back to file_size when size is absent', () => {
    const noSize: RawTilakaPdf = { ...raw, size: undefined, file_size: 99999 }
    const result = transformDocument(noSize, 'req-001', 0)
    expect(result.sizeBytes).toBe(99999)
  })

  it('falls back to page_count when pages is absent', () => {
    const noPages: RawTilakaPdf = { ...raw, pages: undefined, page_count: 8 }
    const result = transformDocument(noPages, 'req-001', 0)
    expect(result.pageCount).toBe(8)
  })

  it('infers pageCount from max page_number in signatures when pages absent', () => {
    const noPagesOrCount: RawTilakaPdf = {
      filename: 'doc.pdf',
      pages: undefined,
      page_count: undefined,
      signatures: [{ page_number: 3 }, { page_number: 7 }],
    }
    const result = transformDocument(noPagesOrCount, 'req-001', 0)
    expect(result.pageCount).toBe(7)
  })

  it('surfaces filename in metadata', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(result.metadata.filename).toBe('contract.pdf')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, 'req-001', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
