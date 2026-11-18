import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawFlowmonoRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/flowmono/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('flowmono transformSigner', () => {
  const envelopeId = 'REF-001'

  const baseRaw: RawFlowmonoRecipient = {
    id: 7,
    recipientEmail: 'alice@example.com',
    recipientName: 'Alice Smith',
    rank: 1,
    status: 'Completed',
    actionDate: '2025-06-03T14:00:00.000Z',
    sentDate: '2025-06-01T10:00:00.000Z',
    declinedDate: undefined,
    declinedReason: undefined,
  }

  it('composes id as envelopeId:recipientId', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.id).toBe('REF-001:7')
  })

  it('maps externalId from raw.id', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.externalId).toBe('7')
  })

  it('maps email from recipientEmail', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from recipientName', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.name).toBe('Alice Smith')
  })

  it('maps status "Completed" to signed', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps status "Signed" to signed', () => {
    const result = transformSigner({ ...baseRaw, status: 'Signed' }, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps status "Declined" to declined', () => {
    const result = transformSigner({ ...baseRaw, status: 'Declined' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps status "Viewed" to delivered', () => {
    const result = transformSigner({ ...baseRaw, status: 'Viewed' }, envelopeId)
    expect(result.status).toBe('delivered')
  })

  it('maps status "Pending" to sent', () => {
    const result = transformSigner({ ...baseRaw, status: 'Pending' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('defaults unknown status to created', () => {
    const result = transformSigner({ ...baseRaw, status: 'unknown-status' }, envelopeId)
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from rank', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.routingOrder).toBe(1)
  })

  it('maps sentAt from sentDate', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.sentAt).toBe('2025-06-01T10:00:00.000Z')
  })

  it('maps signedAt from actionDate', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.signedAt).toBe('2025-06-03T14:00:00.000Z')
  })

  it('sets role to signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('sets platform to flowmono', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.platform).toBe('flowmono')
  })

  it('falls back to email as externalId when id is absent', () => {
    const result = transformSigner({ ...baseRaw, id: undefined }, envelopeId)
    expect(result.externalId).toBe('alice@example.com')
    expect(result.id).toBe('REF-001:alice@example.com')
  })

  it('produces a schema-valid Signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
