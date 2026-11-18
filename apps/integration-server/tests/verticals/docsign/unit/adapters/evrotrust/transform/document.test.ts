import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawEvrotrustDocumentStatus,
} from '../../../../../../../src/verticals/docsign/adapters/evrotrust/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('evrotrust transformDocument', () => {
  it('maps a document with transactionID and fileName', () => {
    const raw: RawEvrotrustDocumentStatus = {
      transactionID: 'txn-abc',
      threadID: 'thread-001',
      status: 2,
      fileName: 'Employment Contract.pdf',
      description: 'Contract for new hire',
    }
    const result = transformDocument(raw, 'thread-001', 0)

    // id = transactionID (the stable doc identifier)
    expect(result.id).toBe('txn-abc')
    expect(result.externalId).toBe('txn-abc')
    expect(result.envelopeId).toBe('thread-001')
    // fileName takes priority over description
    expect(result.name).toBe('Employment Contract.pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('evrotrust')
    // status and isProcessing surfaced in metadata
    expect(result.metadata['status']).toBe('2')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to description when fileName absent', () => {
    const raw: RawEvrotrustDocumentStatus = {
      transactionID: 'txn-def',
      description: 'NDA document',
    }
    const result = transformDocument(raw, 'thread-002', 1)

    expect(result.name).toBe('NDA document')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback id when transactionID absent', () => {
    const raw: RawEvrotrustDocumentStatus = {
      fileName: 'unsigned.pdf',
    }
    const result = transformDocument(raw, 'env-xyz', 2)

    // fallback: envelopeId:doc:order
    expect(result.id).toBe('env-xyz:doc:2')
    expect(result.externalId).toBe('env-xyz:doc:2')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name document-<order> when both fileName and description absent', () => {
    const raw: RawEvrotrustDocumentStatus = {
      transactionID: 'txn-no-name',
    }
    const result = transformDocument(raw, 'env-001', 3)

    expect(result.name).toBe('document-3')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('surfaces rejectReason and automatedSignError in metadata', () => {
    const raw: RawEvrotrustDocumentStatus = {
      transactionID: 'txn-rejected',
      fileName: 'rejected-doc.pdf',
      rejectReason: 'User declined to sign',
      automatedSignError: 'Face recognition failed',
      isProcessing: 0,
    }
    const result = transformDocument(raw, 'env-002', 0)

    expect(result.metadata['rejectReason']).toBe('User declined to sign')
    expect(result.metadata['automatedSignError']).toBe('Face recognition failed')
    expect(result.metadata['isProcessing']).toBe('0')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('does not expose content or url fields', () => {
    const raw: RawEvrotrustDocumentStatus = { transactionID: 'txn-1', fileName: 'test.pdf' }
    const result = transformDocument(raw, 'env-003', 0)

    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })
})
