import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawFptEcontractContract,
} from '../../../../../../../src/verticals/docsign/adapters/fpt-econtract/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('fpt-econtract transformEnvelope', () => {
  const baseRaw: RawFptEcontractContract = {
    id: 'CTR-001',
    code: 'C001',
    title: 'Service Agreement',
    status: 'pending_sign',
    description: 'Contract for services',
    note: 'Urgent',
    creatorId: 'user-1',
    creatorEmail: 'creator@example.com',
    creatorName: 'Alice Creator',
    signType: 'digital',
    signMode: 'sequential',
    templateId: 'tmpl-1',
    recipients: [
      { id: 'r1', recipientId: 'r1', email: 'signer1@example.com', signOrder: 1 },
      { id: 'r2', recipientId: 'r2', email: 'signer2@example.com', signOrder: 2 },
    ],
    documents: [{ id: 'doc1' }, { id: 'doc2' }],
    createdAt: '2025-04-01T08:00:00.000Z',
    sentAt: '2025-04-01T09:00:00.000Z',
    completedAt: undefined,
    expiredAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-04-02T10:00:00.000Z',
  }

  it('maps id from raw.id', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.id).toBe('CTR-001')
    expect(result.externalId).toBe('CTR-001')
  })

  it('maps status "pending_sign" to sent', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.status).toBe('sent')
  })

  it('maps status "draft" to draft', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps status "completed" to completed', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps status "rejected" to declined', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps status "cancelled" to voided', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps status "expired" to expired', () => {
    const result = transformEnvelope({ ...baseRaw, status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps title to subject', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('maps description to message', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.message).toBe('Contract for services')
  })

  it('maps creatorEmail to senderEmail', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderEmail).toBe('creator@example.com')
  })

  it('maps creatorName to senderName', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderName).toBe('Alice Creator')
  })

  it('detects sequential signing order from differing signOrders', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing order when all signOrders equal', () => {
    const result = transformEnvelope({
      ...baseRaw,
      recipients: [
        { id: 'r1', recipientId: 'r1', signOrder: 1 },
        { id: 'r2', recipientId: 'r2', signOrder: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('extracts signerIds ordered by signOrder', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signerIds).toEqual(['r1', 'r2'])
  })

  it('extracts documentIds', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.documentIds).toEqual(['doc1', 'doc2'])
  })

  it('maps templateId', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.templateId).toBe('tmpl-1')
  })

  it('maps createdAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.createdAt).toBe('2025-04-01T08:00:00.000Z')
  })

  it('maps sentAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.sentAt).toBe('2025-04-01T09:00:00.000Z')
  })

  it('maps expiredAt to expiresAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.expiresAt).toBe('2025-05-01T00:00:00.000Z')
  })

  it('maps updatedAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.updatedAt).toBe('2025-04-02T10:00:00.000Z')
  })

  it('sets platform to fpt-econtract', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.platform).toBe('fpt-econtract')
  })

  it('produces a schema-valid Envelope', () => {
    const result = transformEnvelope(baseRaw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
