import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawFlowmonoSigningRequest,
} from '../../../../../../../src/verticals/docsign/adapters/flowmono/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('flowmono transformEnvelope', () => {
  const baseRaw: RawFlowmonoSigningRequest = {
    referenceNumber: 'REF-001',
    clientReference: 'client-ref-1',
    subject: 'NDA for Review',
    initiatorEmail: 'sender@example.com',
    status: 1,
    createdDate: '2025-06-01T10:00:00.000Z',
    lastModifiedDate: '2025-06-02T11:00:00.000Z',
    completedDate: undefined,
    declinedDate: undefined,
    expiryDate: '2025-07-01T00:00:00.000Z',
    notifyRecipientsInSequentialFormat: true,
    signingRequestData: [
      { recipientEmail: 'alice@example.com', recipientName: 'Alice', rank: 1 },
      { recipientEmail: 'bob@example.com', recipientName: 'Bob', rank: 2 },
    ],
    appName: 'MyApp',
  }

  it('maps referenceNumber to id and externalId', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
  })

  it('maps numeric status 1 to sent', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.status).toBe('sent')
  })

  it('maps numeric status 2 to completed', () => {
    const result = transformEnvelope({ ...baseRaw, status: 2 })
    expect(result.status).toBe('completed')
  })

  it('maps numeric status 3 to declined', () => {
    const result = transformEnvelope({ ...baseRaw, status: 3 })
    expect(result.status).toBe('declined')
  })

  it('maps numeric status 4 to voided', () => {
    const result = transformEnvelope({ ...baseRaw, status: 4 })
    expect(result.status).toBe('voided')
  })

  it('maps numeric status 5 to expired', () => {
    const result = transformEnvelope({ ...baseRaw, status: 5 })
    expect(result.status).toBe('expired')
  })

  it('maps string status "completed" correctly', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps sequential flag correctly', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps parallel when sequential flag is false', () => {
    const result = transformEnvelope({ ...baseRaw, notifyRecipientsInSequentialFormat: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('extracts signer IDs from signingRequestData in rank order', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signerIds).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('deduplicates duplicate recipient emails', () => {
    const result = transformEnvelope({
      ...baseRaw,
      signingRequestData: [
        { recipientEmail: 'alice@example.com', rank: 1 },
        { recipientEmail: 'alice@example.com', rank: 2 },
        { recipientEmail: 'bob@example.com', rank: 3 },
      ],
    })
    expect(result.signerIds).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('maps initiatorEmail to senderEmail', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderEmail).toBe('sender@example.com')
  })

  it('maps createdDate to createdAt and sentAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.createdAt).toBe('2025-06-01T10:00:00.000Z')
    expect(result.sentAt).toBe('2025-06-01T10:00:00.000Z')
  })

  it('maps expiryDate to expiresAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.expiresAt).toBe('2025-07-01T00:00:00.000Z')
  })

  it('maps lastModifiedDate to updatedAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.updatedAt).toBe('2025-06-02T11:00:00.000Z')
  })

  it('sets platform to flowmono', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.platform).toBe('flowmono')
  })

  it('falls back to clientReference when referenceNumber is absent', () => {
    const result = transformEnvelope({ ...baseRaw, referenceNumber: undefined })
    expect(result.id).toBe('client-ref-1')
  })

  it('produces a schema-valid Envelope', () => {
    const result = transformEnvelope(baseRaw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
