import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawMekariSignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('mekari-sign transformEnvelope', () => {
  const raw: RawMekariSignDocument = {
    id: 'mek_doc_001',
    filename: 'service-agreement.pdf',
    title: 'Service Agreement',
    subject: 'Please review and sign',
    message: 'Kindly sign by end of week.',
    category: 'global',
    signing_status: 'completed',
    stamping_status: 'success',
    signing_order: true,
    sender_email: 'admin@example.com',
    signers: [
      { id: 'sig_1', email: 'alice@example.com', name: 'Alice', order: 1, status: 'signed' },
      { id: 'sig_2', email: 'bob@example.com', name: 'Bob', order: 2, status: 'signed' },
    ],
    page_count: 5,
    size_bytes: 248320,
    mime_type: 'application/pdf',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-20T14:30:00.000Z',
    sent_at: '2024-01-15T10:05:00.000Z',
    completed_at: '2024-01-20T14:30:00.000Z',
  }

  it('maps id and externalId from document id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('mek_doc_001')
    expect(result.externalId).toBe('mek_doc_001')
  })

  it('maps status completed → completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status in_progress → sent', () => {
    const result = transformEnvelope({ ...raw, signing_status: 'in_progress' })
    expect(result.status).toBe('sent')
  })

  it('maps status voided → voided', () => {
    const result = transformEnvelope({ ...raw, signing_status: 'voided' })
    expect(result.status).toBe('voided')
  })

  it('maps status declined → declined', () => {
    const result = transformEnvelope({ ...raw, signing_status: 'declined' })
    expect(result.status).toBe('declined')
  })

  it('maps status draft → draft', () => {
    const result = transformEnvelope({ ...raw, signing_status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps unknown status → unknown', () => {
    const result = transformEnvelope({ ...raw, signing_status: 'pending_review' })
    expect(result.status).toBe('unknown')
  })

  it('prefers subject over title and filename', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Please review and sign')
  })

  it('falls back to title when subject absent', () => {
    const result = transformEnvelope({ ...raw, subject: undefined })
    expect(result.subject).toBe('Service Agreement')
  })

  it('falls back to filename when subject and title absent', () => {
    const result = transformEnvelope({ ...raw, subject: undefined, title: undefined })
    expect(result.subject).toBe('service-agreement.pdf')
  })

  it('maps message field', () => {
    const result = transformEnvelope(raw)
    expect(result.message).toBe('Kindly sign by end of week.')
  })

  it('maps senderEmail from sender_email', () => {
    const result = transformEnvelope(raw)
    expect(result.senderEmail).toBe('admin@example.com')
  })

  it('maps signing_order:true → sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps signing_order:false → parallel', () => {
    const result = transformEnvelope({ ...raw, signing_order: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from signers array', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['sig_1', 'sig_2'])
  })

  it('maps documentIds as array containing the document id', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['mek_doc_001'])
  })

  it('maps createdAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps sentAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.sentAt).toBe('2024-01-15T10:05:00.000Z')
  })

  it('maps completedAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('sets platform to mekari-sign', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('mekari-sign')
  })

  it('includes category and signingStatus in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.category).toBe('global')
    expect(result.metadata.signingStatus).toBe('completed')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
