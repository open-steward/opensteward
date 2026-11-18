import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawFptEcontractDocument,
} from '../../../../../../../src/verticals/docsign/adapters/fpt-econtract/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('fpt-econtract transformDocument', () => {
  const envelopeId = 'CTR-001'

  const baseRaw: RawFptEcontractDocument = {
    id: 'doc-1',
    documentId: 'doc-1',
    name: 'Service_Agreement.pdf',
    fileName: 'Service_Agreement.pdf',
    fileType: 'pdf',
    contentType: 'application/pdf',
    fileSize: 204800,
    numberOfPages: 10,
    order: 0,
  }

  it('composes id as envelopeId:externalId', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.id).toBe('CTR-001:doc-1')
  })

  it('maps externalId from raw.documentId', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.externalId).toBe('doc-1')
  })

  it('maps envelopeId', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('CTR-001')
  })

  it('maps name from raw.fileName', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.name).toBe('Service_Agreement.pdf')
  })

  it('maps mimeType from contentType', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('infers application/pdf mimeType from fileType "pdf" when contentType absent', () => {
    const result = transformDocument(
      { ...baseRaw, contentType: undefined, mimeType: undefined },
      envelopeId,
      0,
    )
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps fileSize to sizeBytes', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.sizeBytes).toBe(204800)
  })

  it('maps numberOfPages to pageCount', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.pageCount).toBe(10)
  })

  it('maps order from raw.order', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.order).toBe(0)
  })

  it('falls back order to index when raw.order is absent', () => {
    const result = transformDocument({ ...baseRaw, order: undefined }, envelopeId, 3)
    expect(result.order).toBe(3)
  })

  it('falls back externalId to index string when no id fields present', () => {
    const result = transformDocument(
      { ...baseRaw, id: undefined, documentId: undefined },
      envelopeId,
      2,
    )
    expect(result.externalId).toBe('2')
  })

  it('sets platform to fpt-econtract', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('fpt-econtract')
  })

  it('produces a schema-valid Document', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
