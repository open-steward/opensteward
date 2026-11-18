import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLuminSignSignatureRequest,
} from '../../../../../../../src/verticals/docsign/adapters/lumin-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('lumin-sign transformEnvelope', () => {
  // Lumin timestamps are epoch-milliseconds
  const raw: RawLuminSignSignatureRequest = {
    signature_request_id: 'sr_lumin_001',
    title: 'NDA Agreement',
    status: 'APPROVED',
    signing_type: 'ORDER',
    details_url: 'https://app.luminpdf.com/requests/sr_lumin_001',
    reason: 'Contract finalization',
    created_at: 1700000000000,
    updated_at: 1700001000000,
    expires_at: 1702592000000,
    signers: [
      { email_address: 'alice@example.com', name: 'Alice', group: 1, status: 'APPROVED' },
      { email_address: 'bob@example.com', name: 'Bob', group: 2, status: 'WAITING_FOR_OTHERS' },
    ],
  }

  it('maps id and externalId from signature_request_id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('sr_lumin_001')
    expect(result.externalId).toBe('sr_lumin_001')
  })

  it('maps status APPROVED → completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status NEED_TO_SIGN → sent', () => {
    const result = transformEnvelope({ ...raw, status: 'NEED_TO_SIGN' })
    expect(result.status).toBe('sent')
  })

  it('maps status WAITING_FOR_OTHERS → sent', () => {
    const result = transformEnvelope({ ...raw, status: 'WAITING_FOR_OTHERS' })
    expect(result.status).toBe('sent')
  })

  it('maps status REJECTED → declined', () => {
    const result = transformEnvelope({ ...raw, status: 'REJECTED' })
    expect(result.status).toBe('declined')
  })

  it('maps status CANCELLED → voided', () => {
    const result = transformEnvelope({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('voided')
  })

  it('maps unknown status → sent (default)', () => {
    const result = transformEnvelope({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('sent')
  })

  it('maps subject from title', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('NDA Agreement')
  })

  it('maps empty string subject when title is absent', () => {
    const result = transformEnvelope({ ...raw, title: undefined })
    expect(result.subject).toBe('')
  })

  it('maps signing_type ORDER → sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps other signing_type → parallel', () => {
    const result = transformEnvelope({ ...raw, signing_type: 'PARALLEL' })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from signer email addresses', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('maps documentIds as empty array', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual([])
  })

  it('maps createdAt from epoch-ms timestamp', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe(new Date(1700000000000).toISOString())
  })

  it('maps updatedAt from epoch-ms timestamp', () => {
    const result = transformEnvelope(raw)
    expect(result.updatedAt).toBe(new Date(1700001000000).toISOString())
  })

  it('maps expiresAt from epoch-ms timestamp', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe(new Date(1702592000000).toISOString())
  })

  it('sets completedAt when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe(new Date(1700001000000).toISOString())
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, status: 'NEED_TO_SIGN' })
    expect(result.completedAt).toBeUndefined()
  })

  it('sets declinedAt when status is declined', () => {
    const result = transformEnvelope({ ...raw, status: 'REJECTED' })
    expect(result.declinedAt).toBe(new Date(1700001000000).toISOString())
  })

  it('sets voidedAt when status is voided', () => {
    const result = transformEnvelope({ ...raw, status: 'CANCELLED' })
    expect(result.voidedAt).toBe(new Date(1700001000000).toISOString())
  })

  it('sets platform to lumin-sign', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('lumin-sign')
  })

  it('includes detailsUrl and reason in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.detailsUrl).toBe('https://app.luminpdf.com/requests/sr_lumin_001')
    expect(result.metadata.reason).toBe('Contract finalization')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
