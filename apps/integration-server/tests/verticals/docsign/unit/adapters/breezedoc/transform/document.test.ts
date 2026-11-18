import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawBreezedocFile,
} from '../../../../../../../src/verticals/docsign/adapters/breezedoc/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('breezedoc transformDocument', () => {
  it('maps a file with pages and a document title to canonical Document', () => {
    const raw: RawBreezedocFile = {
      id: 501,
      document_file_pages: [{}, {}, {}],
    }

    const result = transformDocument(raw, '101', 0, 'Service Agreement')

    expect(result.id).toBe('101:501')
    expect(result.externalId).toBe('501')
    expect(result.envelopeId).toBe('101')
    // name uses title + 1-indexed position
    expect(result.name).toBe('Service Agreement (1)')
    expect(result.pageCount).toBe(3)
    // BreezeDoc always returns PDF
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('breezedoc')
    expect(result.metadata.fileId).toBe('501')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to document-<externalId> name when no title provided', () => {
    const raw: RawBreezedocFile = { id: 502 }

    const result = transformDocument(raw, '101', 1)

    expect(result.name).toBe('document-502')
    expect(result.order).toBe(1)
    expect(result.pageCount).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('handles string id on raw file', () => {
    const raw: RawBreezedocFile = {
      id: 'file-abc',
      document_file_pages: [{}],
    }

    const result = transformDocument(raw, 'env-42', 2, 'NDA')

    expect(result.id).toBe('env-42:file-abc')
    expect(result.externalId).toBe('file-abc')
    expect(result.envelopeId).toBe('env-42')
    expect(result.name).toBe('NDA (3)')
    expect(result.pageCount).toBe(1)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('sets pageCount to undefined when document_file_pages is absent', () => {
    const raw: RawBreezedocFile = { id: 503 }
    const result = transformDocument(raw, '200', 0)
    expect(result.pageCount).toBeUndefined()
  })

  it('sets pageCount to 0 when document_file_pages is an empty array', () => {
    const raw: RawBreezedocFile = { id: 504, document_file_pages: [] }
    const result = transformDocument(raw, '200', 0, 'Empty Doc')
    expect(result.pageCount).toBe(0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
