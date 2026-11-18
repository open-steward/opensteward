import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawTilakaSigningRequest,
} from '../../../../../../../src/verticals/docsign/adapters/tilaka/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('tilaka transformEnvelope', () => {
  const raw: RawTilakaSigningRequest = {
    request_id: 'req-001',
    document_name: 'Service Agreement',
    status: 'on_progress',
    request_date: '2024-03-10T12:00:00.000Z',
    execute_expiry: '2024-04-10T12:00:00.000Z',
    initiator: { tilaka_name: 'initiator_user', email: 'initiator@example.com' },
    signatures: [
      { tilaka_name: 'signer_a', sequence: 1 },
      { tilaka_name: 'signer_b', sequence: 2 },
    ],
    list_pdf: [{ filename: 'contract.pdf' }, { filename: 'exhibit.pdf' }],
  }

  it('maps id and externalId from request_id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('req-001')
    expect(result.externalId).toBe('req-001')
  })

  it('maps on_progress status → sent', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
  })

  it('maps done status → completed', () => {
    const result = transformEnvelope({ ...raw, status: 'done' })
    expect(result.status).toBe('completed')
  })

  it('maps signed status → completed', () => {
    const result = transformEnvelope({ ...raw, status: 'signed' })
    expect(result.status).toBe('completed')
  })

  it('maps draft status → draft', () => {
    const result = transformEnvelope({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps denied status → declined', () => {
    const result = transformEnvelope({ ...raw, status: 'denied' })
    expect(result.status).toBe('declined')
  })

  it('maps cancel status → voided', () => {
    const result = transformEnvelope({ ...raw, status: 'cancel' })
    expect(result.status).toBe('voided')
  })

  it('maps expire status → expired', () => {
    const result = transformEnvelope({ ...raw, status: 'expire' })
    expect(result.status).toBe('expired')
  })

  it('maps pending status → sent', () => {
    const result = transformEnvelope({ ...raw, status: 'pending' })
    expect(result.status).toBe('sent')
  })

  it('maps document_name to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('sets senderId and senderName to initiator tilaka_name', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('initiator_user')
    expect(result.senderName).toBe('initiator_user')
  })

  it('sets senderEmail from initiator object email', () => {
    const result = transformEnvelope(raw)
    expect(result.senderEmail).toBe('initiator@example.com')
  })

  it('sets senderEmail to undefined when initiator has no email', () => {
    const result = transformEnvelope({ ...raw, initiator: { tilaka_name: 'user-x' } })
    expect(result.senderEmail).toBeUndefined()
  })

  it('detects sequential signing order from distinct sequence values', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing order when all sequences are the same', () => {
    const parallel: RawTilakaSigningRequest = {
      ...raw,
      signatures: [
        { tilaka_name: 'signer_a', sequence: 1 },
        { tilaka_name: 'signer_b', sequence: 1 },
      ],
    }
    const result = transformEnvelope(parallel)
    expect(result.signingOrder).toBe('parallel')
  })

  it('builds signerIds as envelopeId:tilaka_name', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['req-001:signer_a', 'req-001:signer_b'])
  })

  it('builds documentIds as envelopeId:filename', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['req-001:contract.pdf', 'req-001:exhibit.pdf'])
  })

  it('maps request_date to createdAt', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('maps execute_expiry to expiresAt', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2024-04-10T12:00:00.000Z')
  })

  it('sets platform to tilaka', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('tilaka')
  })

  it('surfaces status in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.status).toBe('on_progress')
  })

  it('falls back to message field for status mapping when status is absent', () => {
    const msgOnly: RawTilakaSigningRequest = {
      ...raw,
      status: undefined,
      message: 'DONE',
    }
    const result = transformEnvelope(msgOnly)
    expect(result.status).toBe('completed')
  })

  it('uses signature array as fallback when signatures is absent', () => {
    const altRaw: RawTilakaSigningRequest = {
      ...raw,
      signatures: undefined,
      signature: [{ tilaka_name: 'signer_x', sequence: 1 }],
    }
    const result = transformEnvelope(altRaw)
    expect(result.signerIds).toEqual(['req-001:signer_x'])
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
