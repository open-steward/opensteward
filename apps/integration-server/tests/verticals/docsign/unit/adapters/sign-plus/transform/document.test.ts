import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSignPlusDocument,
} from '../../../../../../../src/verticals/docsign/adapters/sign-plus/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('sign-plus transformDocument', () => {
  it('maps a PDF document to canonical Document', () => {
    const raw: RawSignPlusDocument = {
      id: 'doc-001',
      name: 'Service Agreement',
      filename: 'service-agreement.pdf',
      page_count: 10,
    }

    const result = transformDocument(raw, 'env-001', 0)

    // id maps from raw.id
    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('env-001')
    // name prefers raw.name over filename
    expect(result.name).toBe('Service Agreement')
    expect(result.pageCount).toBe(10)
    // .pdf filename → application/pdf
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('sign-plus')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('derives mimeType from filename when name has no extension info', () => {
    const raw: RawSignPlusDocument = { id: 'doc-2', filename: 'contract.pdf' }
    const result = transformDocument(raw, 'env-1', 1)
    expect(result.mimeType).toBe('application/pdf')
    // name falls back to filename
    expect(result.name).toBe('contract.pdf')
  })

  it('leaves mimeType undefined when filename does not end in .pdf', () => {
    const raw: RawSignPlusDocument = { id: 'doc-3', filename: 'doc.docx' }
    const result = transformDocument(raw, 'env-1', 0)
    expect(result.mimeType).toBeUndefined()
  })

  it('falls back to compound id when raw.id absent', () => {
    const raw: RawSignPlusDocument = { name: 'Mystery Doc' }
    const result = transformDocument(raw, 'env-1', 3)
    expect(result.id).toBe('env-1:3')
    expect(result.externalId).toBe('env-1:3')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('derives pageCount from pages array length when page_count absent', () => {
    const raw: RawSignPlusDocument = {
      id: 'doc-4',
      pages: [
        { width: 595, height: 842 },
        { width: 595, height: 842 },
      ],
    }
    const result = transformDocument(raw, 'env-1', 0)
    expect(result.pageCount).toBe(2)
  })
})
