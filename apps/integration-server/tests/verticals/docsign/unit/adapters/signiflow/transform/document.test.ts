import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/document'
import type { RawSigniFlowDocument } from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signiflow transformDocument', () => {
  it('maps a full SigniFlow document to canonical Document with PDF mime type', () => {
    const raw: RawSigniFlowDocument = {
      DocID: 101,
      DocName: 'service-agreement.pdf',
      DocExtension: 'pdf',
      DocumentSize: 204800,
      PageCount: 8,
    }
    const result = transformDocument(raw, 'doc-101')

    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    expect(result.envelopeId).toBe('doc-101')
    expect(result.name).toBe('service-agreement.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.sizeBytes).toBe(204800)
    expect(result.pageCount).toBe(8)
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signiflow')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('maps a docx document with alternate field names', () => {
    const raw: RawSigniFlowDocument = {
      DocumentID: 202,
      DocumentName: 'contract.docx',
      DocumentExtension: 'docx',
    }
    const result = transformDocument(raw, 'doc-202')

    expect(result.id).toBe('202')
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to envelopeId when DocID is absent', () => {
    const raw: RawSigniFlowDocument = {
      DocName: 'spreadsheet.xlsx',
      DocExtension: 'xlsx',
    }
    const result = transformDocument(raw, 'env-fallback')

    expect(result.id).toBe('env-fallback')
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
