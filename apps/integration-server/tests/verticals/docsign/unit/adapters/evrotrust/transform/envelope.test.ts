import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawEvrotrustThreadStatus,
} from '../../../../../../../src/verticals/docsign/adapters/evrotrust/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  STATUS_SIGNED,
  STATUS_REJECTED,
  STATUS_EXPIRED,
  STATUS_WITHDRAWN,
  STATUS_PENDING,
} from '../../../../../../../src/verticals/docsign/adapters/evrotrust/constants'

describe('evrotrust transformEnvelope', () => {
  it('maps a signed (completed) thread with transactionID in documentIds', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-001',
      transactionID: 'txn-abc',
      status: STATUS_SIGNED, // 2 → completed
      dateExpire: '2026-06-01T00:00:00.000Z',
      description: 'Employment Contract',
    }
    const result = transformEnvelope(raw, 'thread-001')

    expect(result.id).toBe('thread-001')
    expect(result.externalId).toBe('thread-001')
    expect(result.status).toBe('completed')
    // description → subject
    expect(result.subject).toBe('Employment Contract')
    // Evrotrust is always parallel (single-signer-per-transaction model)
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual([])
    // transactionID surfaces as documentId
    expect(result.documentIds).toEqual(['txn-abc'])
    expect(result.expiresAt).toBe('2026-06-01T00:00:00.000Z')
    expect(result.platform).toBe('evrotrust')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_REJECTED → declined', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-002',
      status: STATUS_REJECTED, // 3
    }
    const result = transformEnvelope(raw, 'thread-002')

    expect(result.status).toBe('declined')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_WITHDRAWN → voided', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-003',
      status: STATUS_WITHDRAWN, // 6
    }
    const result = transformEnvelope(raw, 'thread-003')

    expect(result.status).toBe('voided')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_EXPIRED → expired', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-004',
      status: STATUS_EXPIRED, // 4
    }
    const result = transformEnvelope(raw, 'thread-004')

    expect(result.status).toBe('expired')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps STATUS_PENDING and other codes → sent (still in-flight)', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-005',
      status: STATUS_PENDING, // 1
      isProcessing: 0,
    }
    const result = transformEnvelope(raw, 'thread-005')

    expect(result.status).toBe('sent')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to threadId parameter when threadID absent', () => {
    const raw: RawEvrotrustThreadStatus = { status: STATUS_SIGNED }
    const result = transformEnvelope(raw, 'fallback-thread')

    expect(result.id).toBe('fallback-thread')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('has empty documentIds when transactionID absent', () => {
    const raw: RawEvrotrustThreadStatus = {
      threadID: 'thread-006',
      status: STATUS_PENDING,
    }
    const result = transformEnvelope(raw, 'thread-006')

    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
