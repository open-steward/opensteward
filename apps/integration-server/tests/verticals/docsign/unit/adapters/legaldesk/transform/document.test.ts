import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawLegaldeskDocumentDetail,
} from '../../../../../../../src/verticals/docsign/adapters/legaldesk/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('legaldesk transformDocument', () => {
  const raw: RawLegaldeskDocumentDetail = {
    document_id: 'doc_99',
    document_name: 'Contract.pdf',
    size: 204800,
    pages: 5,
    mime_type: 'application/pdf',
    category: 'agreement',
  }

  it('maps document_id to externalId', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.externalId).toBe('doc_99')
  })

  it('builds composite id from transactionId:externalId', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.id).toBe('txn_001:doc_99')
  })

  it('maps document_name to name', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.name).toBe('Contract.pdf')
  })

  it('maps size to sizeBytes', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.sizeBytes).toBe(204800)
  })

  it('maps pages to pageCount', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.pageCount).toBe(5)
  })

  it('maps mime_type to mimeType', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to the index parameter', () => {
    const result = transformDocument(raw, 'txn_001', 3)
    expect(result.order).toBe(3)
  })

  it('sets platform to legaldesk', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.platform).toBe('legaldesk')
  })

  it('sets envelopeId to transactionId', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(result.envelopeId).toBe('txn_001')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(raw, 'txn_001', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to doc_id when document_id is absent', () => {
    const { document_id: _, ...rest } = raw
    const result = transformDocument({ ...rest, doc_id: 'doc_fallback' }, 'txn_001', 0)
    expect(result.externalId).toBe('doc_fallback')
  })

  it('falls back to positional id when no id is present', () => {
    const { document_id: _, ...rest } = raw
    const result = transformDocument(rest, 'txn_abc', 2)
    expect(result.externalId).toBe('txn_abc:2')
    expect(result.id).toBe('txn_abc:txn_abc:2')
  })
})
