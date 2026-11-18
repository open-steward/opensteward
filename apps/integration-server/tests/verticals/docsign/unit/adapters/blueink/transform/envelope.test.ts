import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawBlueinkBundle,
} from '../../../../../../../src/verticals/docsign/adapters/blueink/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('blueink transformEnvelope', () => {
  const raw: RawBlueinkBundle = {
    id: 'bnd_abc123',
    status: 'co',
    label: 'Service Agreement',
    email_subject: 'Please sign',
    email_message: 'Review and sign by Friday.',
    requester_email: 'sender@example.com',
    requester_name: 'Alice Admin',
    in_order: true,
    created: '2024-01-15T10:00:00.000Z',
    sent: '2024-01-15T10:05:00.000Z',
    completed_at: '2024-01-20T14:30:00.000Z',
    expired_at: '2024-03-15T10:00:00.000Z',
    is_test: false,
    docs_ready: true,
    custom_key: 'ck_001',
    packets: [
      { id: 'pkt_1', key: 'k1', order: 1 },
      { id: 'pkt_2', key: 'k2', order: 2 },
    ],
    documents: [
      { key: 'doc_a', filename: 'contract.pdf' },
      { key: 'doc_b', filename: 'exhibit.pdf' },
    ],
    tags: ['legal', 'q1'],
  }

  it('maps id and externalId from bundle id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('bnd_abc123')
    expect(result.externalId).toBe('bnd_abc123')
  })

  it('maps status co → completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status ne → draft', () => {
    const result = transformEnvelope({ ...raw, status: 'ne' })
    expect(result.status).toBe('draft')
  })

  it('maps status dr → draft', () => {
    const result = transformEnvelope({ ...raw, status: 'dr' })
    expect(result.status).toBe('draft')
  })

  it('maps status pe → sent', () => {
    const result = transformEnvelope({ ...raw, status: 'pe' })
    expect(result.status).toBe('sent')
  })

  it('maps status se → sent', () => {
    const result = transformEnvelope({ ...raw, status: 'se' })
    expect(result.status).toBe('sent')
  })

  it('maps status st → delivered', () => {
    const result = transformEnvelope({ ...raw, status: 'st' })
    expect(result.status).toBe('delivered')
  })

  it('maps status ca → voided', () => {
    const result = transformEnvelope({ ...raw, status: 'ca' })
    expect(result.status).toBe('voided')
  })

  it('maps status ex → expired', () => {
    const result = transformEnvelope({ ...raw, status: 'ex' })
    expect(result.status).toBe('expired')
  })

  it('maps status fa → declined', () => {
    const result = transformEnvelope({ ...raw, status: 'fa' })
    expect(result.status).toBe('declined')
  })

  it('prefers label over email_subject for subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('falls back to email_subject when label is absent', () => {
    const result = transformEnvelope({ ...raw, label: undefined })
    expect(result.subject).toBe('Please sign')
  })

  it('maps senderEmail and senderName', () => {
    const result = transformEnvelope(raw)
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.senderName).toBe('Alice Admin')
  })

  it('maps in_order:true → sequential signing order', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps in_order:false → parallel signing order', () => {
    const result = transformEnvelope({ ...raw, in_order: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from packet ids sorted by order', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['pkt_1', 'pkt_2'])
  })

  it('maps documentIds from document keys', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc_a', 'doc_b'])
  })

  it('maps createdAt and completedAt as ISO datetimes', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.completedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('maps sentAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.sentAt).toBe('2024-01-15T10:05:00.000Z')
  })

  it('maps expiresAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2024-03-15T10:00:00.000Z')
  })

  it('sets platform to blueink', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('blueink')
  })

  it('includes custom_key and tags in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.customKey).toBe('ck_001')
    expect(result.metadata.tags).toBe('legal,q1')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
