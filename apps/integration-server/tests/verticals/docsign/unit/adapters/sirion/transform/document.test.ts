import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSirionDocument,
} from '../../../../../../../src/verticals/docsign/adapters/sirion/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const ENVELOPE_ID = 'ctr-sirion-1'

describe('sirion transformDocument', () => {
  it('uses documentId as id when present', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
  })

  it('falls back to envelopeId:order when documentId absent', () => {
    const raw: RawSirionDocument = { fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 2)
    expect(result.id).toBe('ctr-sirion-1:2')
    expect(result.externalId).toBe('ctr-sirion-1:2')
  })

  it('maps envelopeId', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps fileName to name', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.name).toBe('MSA.pdf')
  })

  it('falls back to raw.name when fileName absent', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', name: 'Exhibit-A.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.name).toBe('Exhibit-A.pdf')
  })

  it('falls back to document-{order} when both fileName and name absent', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001' }
    const result = transformDocument(raw, ENVELOPE_ID, 3)
    expect(result.name).toBe('document-3')
  })

  it('maps fileSize to sizeBytes', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'MSA.pdf',
      fileSize: 248320,
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.sizeBytes).toBe(248320)
  })

  it('falls back to sizeInBytes when fileSize absent', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'MSA.pdf',
      sizeInBytes: 10000,
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.sizeBytes).toBe(10000)
  })

  it('maps pageCount', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'MSA.pdf',
      pageCount: 12,
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.pageCount).toBe(12)
  })

  it('maps mimeType from raw.mimeType', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('falls back to application/pdf when mimeType absent', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order parameter', () => {
    const raw: RawSirionDocument = { documentId: 'doc-002', fileName: 'Exhibit-A.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 1)
    expect(result.order).toBe(1)
  })

  it('sets platform to sirion', () => {
    const raw: RawSirionDocument = { documentId: 'doc-001', fileName: 'MSA.pdf' }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.platform).toBe('sirion')
  })

  it('puts documentType into metadata', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'MSA.pdf',
      documentType: 'EXECUTED',
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(result.metadata.documentType).toBe('EXECUTED')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const raw: RawSirionDocument = {
      documentId: 'doc-001',
      fileName: 'MSA.pdf',
      pageCount: 12,
      fileSize: 248320,
      mimeType: 'application/pdf',
    }
    const result = transformDocument(raw, ENVELOPE_ID, 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
