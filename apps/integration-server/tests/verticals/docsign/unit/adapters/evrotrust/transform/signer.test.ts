import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawEvrotrustSignerStatus,
} from '../../../../../../../src/verticals/docsign/adapters/evrotrust/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import {
  STATUS_SIGNED,
  STATUS_REJECTED,
  STATUS_EXPIRED,
  STATUS_WITHDRAWN,
  STATUS_FAILED,
  STATUS_FAILED_FACE_RECOGNITION,
  STATUS_PENDING,
} from '../../../../../../../src/verticals/docsign/adapters/evrotrust/constants'

describe('evrotrust transformSigner', () => {
  it('maps a signed signer (STATUS_SIGNED) with placeholder email', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-abc',
      threadID: 'thread-001',
      status: STATUS_SIGNED, // 2
    }
    const result = transformSigner(raw, 'thread-001')

    expect(result.id).toBe('txn-abc')
    expect(result.externalId).toBe('txn-abc')
    expect(result.envelopeId).toBe('thread-001')
    // Evrotrust does not expose signer email — placeholder on .invalid TLD
    expect(result.email).toMatch(/@evrotrust\.invalid$/)
    expect(result.name).toBe('')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.platform).toBe('evrotrust')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_REJECTED → declined', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-rejected',
      status: STATUS_REJECTED, // 3
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_WITHDRAWN → declined', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-withdrawn',
      status: STATUS_WITHDRAWN, // 6
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_EXPIRED → auto_responded', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-expired',
      status: STATUS_EXPIRED, // 4
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('auto_responded')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_FAILED → declined', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-failed',
      status: STATUS_FAILED, // 5
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_FAILED_FACE_RECOGNITION → declined', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-face-fail',
      status: STATUS_FAILED_FACE_RECOGNITION, // 8
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps pending/default codes → sent', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-pending',
      status: STATUS_PENDING, // 1
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('uses fallback id when transactionID absent', () => {
    const raw: RawEvrotrustSignerStatus = {
      status: STATUS_PENDING,
    }
    const result = transformSigner(raw, 'env-fallback')

    expect(result.id).toBe('env-fallback:signer')
    expect(result.externalId).toBe('env-fallback:signer')
    expect(result.email).toMatch(/@evrotrust\.invalid$/)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('surfaces metadata fields for status, isProcessing, rejectReason', () => {
    const raw: RawEvrotrustSignerStatus = {
      transactionID: 'txn-meta',
      status: STATUS_REJECTED,
      isProcessing: 0,
      rejectReason: 'User cancelled',
      automatedSignError: '',
    }
    const result = transformSigner(raw, 'env-001')

    expect(result.metadata['status']).toBe('3')
    expect(result.metadata['isProcessing']).toBe('0')
    expect(result.metadata['rejectReason']).toBe('User cancelled')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
