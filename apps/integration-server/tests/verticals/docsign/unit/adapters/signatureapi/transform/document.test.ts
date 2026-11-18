import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSignatureapiDocument,
} from '../../../../../../../src/verticals/docsign/adapters/signatureapi/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signatureapi transformDocument', () => {
  it('maps a PDF document to canonical Document', () => {
    const raw: RawSignatureapiDocument = {
      id: 'doc-001',
      title: 'Service Agreement',
      name: 'service-agreement',
      format: 'pdf',
      pages: 8,
    }

    const result = transformDocument(raw, 'env-001', 0)

    // id maps from raw.id
    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('env-001')
    // title preferred over name
    expect(result.name).toBe('Service Agreement')
    expect(result.pageCount).toBe(8)
    // pdf → application/pdf via FORMAT_MIME lookup
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signatureapi')
    expect(result.metadata.format).toBe('pdf')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('maps docx format to the correct mime type', () => {
    const raw: RawSignatureapiDocument = { id: 'doc-2', format: 'docx' }
    const result = transformDocument(raw, 'env-1', 1)
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('falls back to name when title absent', () => {
    const raw: RawSignatureapiDocument = { id: 'doc-3', name: 'contract' }
    const result = transformDocument(raw, 'env-1', 0)
    expect(result.name).toBe('contract')
  })

  it('uses document-N fallback name when both title and name absent', () => {
    const raw: RawSignatureapiDocument = { id: 'doc-4' }
    const result = transformDocument(raw, 'env-1', 2)
    expect(result.name).toBe('document-2')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('passes through an unrecognised format string as mimeType', () => {
    const raw: RawSignatureapiDocument = { id: 'doc-5', format: 'image/png' }
    const result = transformDocument(raw, 'env-1', 0)
    expect(result.mimeType).toBe('image/png')
  })

  it('leaves mimeType undefined when format is absent', () => {
    const raw: RawSignatureapiDocument = { id: 'doc-6' }
    const result = transformDocument(raw, 'env-1', 0)
    expect(result.mimeType).toBeUndefined()
  })
})
