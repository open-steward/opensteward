import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawPrivyDocumentFile,
} from '../../../../../../../src/verticals/docsign/adapters/privyid/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('privyid transformDocument', () => {
  const raw: RawPrivyDocumentFile = {
    docToken: 'DOC-ABC123',
    documentTitle: 'Service Agreement',
    filename: 'service-agreement.pdf',
    docType: 'contract',
    mimeType: 'application/pdf',
    size: 204800,
    pages: 8,
  }

  const envelopeId = 'ENV-001'

  it('constructs id as envelopeId:docToken', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.id).toBe('ENV-001:DOC-ABC123')
    expect(result.externalId).toBe('DOC-ABC123')
  })

  it('maps name from filename', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.name).toBe('service-agreement.pdf')
  })

  it('falls back to documentTitle when filename is absent', () => {
    const result = transformDocument({ ...raw, filename: undefined }, envelopeId)
    expect(result.name).toBe('Service Agreement')
  })

  it('maps sizeBytes from size', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.sizeBytes).toBe(204800)
  })

  it('maps pageCount from pages', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.pageCount).toBe(8)
  })

  it('maps mimeType from mimeType field', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('defaults mimeType to application/pdf when absent', () => {
    const result = transformDocument({ ...raw, mimeType: undefined }, envelopeId)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to 0', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.order).toBe(0)
  })

  it('sets envelopeId', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.envelopeId).toBe('ENV-001')
  })

  it('sets platform to privyid', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.platform).toBe('privyid')
  })

  it('includes docType in metadata', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.metadata.docType).toBe('contract')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, envelopeId)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
