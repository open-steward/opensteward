import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawPrivyDocument,
} from '../../../../../../../src/verticals/docsign/adapters/privyid/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('privyid transformEnvelope', () => {
  const raw: RawPrivyDocument = {
    docToken: 'DOC-ABC123',
    documentTitle: 'Service Agreement',
    status: 'In Progress',
    docType: 'pdf',
    owner: 'merchant-001',
    ownerName: 'Alice Merchant',
    ownerEmail: 'alice@example.com',
    channelId: 'ch_99',
    recipients: [
      { privyId: 'PVY-001', email: 'bob@example.com', name: 'Bob', sequence: 1 },
      { privyId: 'PVY-002', email: 'carol@example.com', name: 'Carol', sequence: 2 },
    ],
    createDate: '2026-01-10T08:00:00.000Z',
    modifiedDate: '2026-01-12T10:00:00.000Z',
    expireDate: '2026-04-10T08:00:00.000Z',
  }

  it('maps id and externalId from docToken', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('DOC-ABC123')
    expect(result.externalId).toBe('DOC-ABC123')
  })

  it('maps In Progress status to sent', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
  })

  it('maps draft status to draft', () => {
    const result = transformEnvelope({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps completed status to completed', () => {
    const result = transformEnvelope({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps rejected status to declined', () => {
    const result = transformEnvelope({ ...raw, status: 'rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps cancelled status to voided', () => {
    const result = transformEnvelope({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps expire status to expired', () => {
    const result = transformEnvelope({ ...raw, status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps subject from documentTitle', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('maps sender fields from owner/ownerName/ownerEmail', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('merchant-001')
    expect(result.senderName).toBe('Alice Merchant')
    expect(result.senderEmail).toBe('alice@example.com')
  })

  it('detects sequential order when recipients have distinct sequences', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel order when all recipients have the same sequence', () => {
    const result = transformEnvelope({
      ...raw,
      recipients: [
        { privyId: 'PVY-001', sequence: 1 },
        { privyId: 'PVY-002', sequence: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from recipient privyIds', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['PVY-001', 'PVY-002'])
  })

  it('maps documentIds to [docToken]', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['DOC-ABC123'])
  })

  it('maps createdAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('maps expiresAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2026-04-10T08:00:00.000Z')
  })

  it('sets platform to privyid', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('privyid')
  })

  it('includes docType and channelId in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.docType).toBe('pdf')
    expect(result.metadata.channelId).toBe('ch_99')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
