import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/document'
import type { RawBoldsignFile } from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('boldsign transformDocument', () => {
  it('maps id and externalId as documentId:order', () => {
    const raw: RawBoldsignFile = { documentName: 'Contract.pdf', pageCount: 10 }
    const result = transformDocument(raw, 'doc-abc-123', 0)
    expect(result.id).toBe('doc-abc-123:0')
    expect(result.externalId).toBe('doc-abc-123:0')
  })

  it('maps envelopeId to documentId', () => {
    const raw: RawBoldsignFile = { documentName: 'NDA.pdf', pageCount: 3 }
    const result = transformDocument(raw, 'doc-abc-123', 0)
    expect(result.envelopeId).toBe('doc-abc-123')
  })

  it('maps name from documentName', () => {
    const raw: RawBoldsignFile = { documentName: 'Service Agreement.pdf', pageCount: 7 }
    const result = transformDocument(raw, 'doc-xyz', 0)
    expect(result.name).toBe('Service Agreement.pdf')
  })

  it('falls back to fileName when documentName is absent', () => {
    const raw: RawBoldsignFile = { fileName: 'Exhibit-A.pdf', pageCount: 2 }
    const result = transformDocument(raw, 'doc-xyz', 1)
    expect(result.name).toBe('Exhibit-A.pdf')
  })

  it('maps pageCount', () => {
    const raw: RawBoldsignFile = { documentName: 'Contract.pdf', pageCount: 12 }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect(result.pageCount).toBe(12)
  })

  it('maps order to the provided index', () => {
    const raw: RawBoldsignFile = { documentName: 'Annex.pdf', pageCount: 1 }
    const result = transformDocument(raw, 'doc-abc', 2)
    expect(result.order).toBe(2)
  })

  it('sets mimeType to application/pdf for .pdf filenames', () => {
    const raw: RawBoldsignFile = { documentName: 'Agreement.pdf', pageCount: 5 }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('leaves mimeType undefined for non-pdf filenames', () => {
    const raw: RawBoldsignFile = { documentName: 'Spreadsheet.xlsx', pageCount: 1 }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect(result.mimeType).toBeUndefined()
  })

  it('sets platform to boldsign', () => {
    const raw: RawBoldsignFile = { documentName: 'NDA.pdf', pageCount: 4 }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect(result.platform).toBe('boldsign')
  })

  it('puts fileName into metadata', () => {
    const raw: RawBoldsignFile = {
      documentName: 'Contract.pdf',
      fileName: 'contract_v2.pdf',
      pageCount: 8,
    }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect(result.metadata.fileName).toBe('contract_v2.pdf')
  })

  it('does not expose a content or url field', () => {
    const raw: RawBoldsignFile = { documentName: 'NDA.pdf', pageCount: 2 }
    const result = transformDocument(raw, 'doc-abc', 0)
    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const raw: RawBoldsignFile = { documentName: 'NDA.pdf', pageCount: 5 }
    const result = transformDocument(raw, 'doc-abc-123', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('handles second file in envelope with order:1', () => {
    const raw: RawBoldsignFile = { documentName: 'Appendix.pdf', pageCount: 3 }
    const result = transformDocument(raw, 'doc-abc-123', 1)
    expect(result.id).toBe('doc-abc-123:1')
    expect(result.order).toBe(1)
  })
})
