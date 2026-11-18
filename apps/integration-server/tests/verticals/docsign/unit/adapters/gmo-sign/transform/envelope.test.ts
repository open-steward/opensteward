import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawGmoSignEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/gmo-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('gmo-sign transformEnvelope', () => {
  const baseRaw: RawGmoSignEnvelope = {
    envelope_xid: 'GMO-XID-001',
    envelope_name: 'Business Contract',
    envelope_status: 'in_progress',
    sender_name: 'Alice Admin',
    sender_post_name: 'Alice Admin (Legal)',
    created_date: '2025-03-01T00:00:00.000Z',
    completed_date: undefined,
    expire_date: '2025-04-01T00:00:00.000Z',
    document_list: [
      { control_number: 'CN-001', document_name: 'Contract.pdf' },
      { control_number: 'CN-002', document_name: 'Annex.pdf' },
    ],
    signer_list: [
      {
        envelope_signer_id: 'SGN-1',
        email: 'signer1@example.com',
        order_no: '1',
        sign_status: 'pending',
      },
      {
        envelope_signer_id: 'SGN-2',
        email: 'signer2@example.com',
        order_no: '2',
        sign_status: 'pending',
      },
    ],
  }

  it('maps envelope_xid to id', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.id).toBe('GMO-XID-001')
    expect(result.externalId).toBe('GMO-XID-001')
  })

  it('maps envelope_status "in_progress" to sent', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.status).toBe('sent')
  })

  it('maps envelope_status "" to draft', () => {
    const result = transformEnvelope({ ...baseRaw, envelope_status: '' })
    expect(result.status).toBe('draft')
  })

  it('maps envelope_status "completed" to completed', () => {
    const result = transformEnvelope({ ...baseRaw, envelope_status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps envelope_status "declined" to declined', () => {
    const result = transformEnvelope({ ...baseRaw, envelope_status: 'declined' })
    expect(result.status).toBe('declined')
  })

  it('maps envelope_status "voided" to voided', () => {
    const result = transformEnvelope({ ...baseRaw, envelope_status: 'voided' })
    expect(result.status).toBe('voided')
  })

  it('maps envelope_status "expired" to expired', () => {
    const result = transformEnvelope({ ...baseRaw, envelope_status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps envelope_name to subject', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.subject).toBe('Business Contract')
  })

  it('maps sender_name to senderName', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderName).toBe('Alice Admin')
  })

  it('detects sequential signing order from differing order_no values', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing order when all signers share order_no', () => {
    const result = transformEnvelope({
      ...baseRaw,
      signer_list: [
        { envelope_signer_id: 'SGN-1', order_no: '1' },
        { envelope_signer_id: 'SGN-2', order_no: '1' },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('extracts signerIds from signer_list ordered by order_no', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signerIds).toEqual(['SGN-1', 'SGN-2'])
  })

  it('extracts documentIds from document_list control_numbers', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.documentIds).toEqual(['CN-001', 'CN-002'])
  })

  it('maps created_date to createdAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.createdAt).toBe('2025-03-01T00:00:00.000Z')
  })

  it('maps expire_date to expiresAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.expiresAt).toBe('2025-04-01T00:00:00.000Z')
  })

  it('maps completedAt and sets updatedAt to same value', () => {
    const result = transformEnvelope({
      ...baseRaw,
      completed_date: '2025-03-25T16:00:00.000Z',
    })
    expect(result.completedAt).toBe('2025-03-25T16:00:00.000Z')
    expect(result.updatedAt).toBe('2025-03-25T16:00:00.000Z')
  })

  it('sets platform to gmo-sign', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.platform).toBe('gmo-sign')
  })

  it('produces a schema-valid Envelope', () => {
    const result = transformEnvelope(baseRaw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
