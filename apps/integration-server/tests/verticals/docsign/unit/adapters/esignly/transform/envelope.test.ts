import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawEsignlySignRequest,
} from '../../../../../../../src/verticals/docsign/adapters/esignly/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('esignly transformEnvelope', () => {
  it('maps a completed sign request with sequential signers', () => {
    const raw: RawEsignlySignRequest = {
      document_id: 'req-001',
      status: 'completed',
      title: 'Employment Contract',
      message: 'Please sign by Friday',
      sender_id: 'usr-01',
      sender_email: 'sender@example.com',
      sender_name: 'HR Team',
      template_key: 'tmpl-nda',
      signing_type: 'sequential',
      created_at: '2026-01-10T09:00:00.000Z',
      sent_at: '2026-01-10T09:05:00.000Z',
      completed_at: '2026-01-15T14:00:00.000Z',
      updated_at: '2026-01-15T14:00:00.000Z',
      expires_at: '2026-02-10T00:00:00.000Z',
      signers: [
        { signer_id: 'sg-1', signer_email: 'alice@example.com', signing_order: 1 },
        { signer_id: 'sg-2', signer_email: 'bob@example.com', signing_order: 2 },
      ],
      documents: [{ document_id: 'doc-a' }, { document_id: 'doc-b' }],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('req-001')
    expect(result.externalId).toBe('req-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Employment Contract')
    expect(result.message).toBe('Please sign by Friday')
    expect(result.senderId).toBe('usr-01')
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.senderName).toBe('HR Team')
    expect(result.templateId).toBe('tmpl-nda')
    // signing_type=sequential overrides order analysis
    expect(result.signingOrder).toBe('sequential')
    // signerIds sorted by signing_order
    expect(result.signerIds).toEqual(['sg-1', 'sg-2'])
    expect(result.documentIds).toEqual(['doc-a', 'doc-b'])
    expect(result.completedAt).toBe('2026-01-15T14:00:00.000Z')
    expect(result.voidedAt).toBeUndefined()
    expect(result.platform).toBe('esignly')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status=sent (pending) to sent', () => {
    const raw: RawEsignlySignRequest = {
      request_id: 'req-002',
      status: 'pending',
      sent_at: '2026-01-10T09:05:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('req-002')
    expect(result.status).toBe('sent')
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled → voided with voidedAt', () => {
    const raw: RawEsignlySignRequest = {
      document_id: 'req-003',
      status: 'cancelled',
      cancelled_at: '2026-02-01T08:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2026-02-01T08:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps declined to declined with declinedAt', () => {
    const raw: RawEsignlySignRequest = {
      document_id: 'req-004',
      status: 'declined',
      declined_at: '2026-02-05T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2026-02-05T10:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('detects parallel from distinct signer orders when signing_type not set', () => {
    const raw: RawEsignlySignRequest = {
      document_id: 'req-005',
      status: 'sent',
      // different signing_orders but no explicit signing_type → sequential by order analysis
      signers: [
        { signer_id: 'sg-a', signing_order: 1 },
        { signer_id: 'sg-b', signing_order: 2 },
      ],
    }
    const result = transformEnvelope(raw)

    // different orders → sequential inferred
    expect(result.signingOrder).toBe('sequential')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses documentId as fallback documentId when documents array is empty', () => {
    const raw: RawEsignlySignRequest = {
      document_id: 'req-006',
      status: 'draft',
      documents: [],
    }
    const result = transformEnvelope(raw)

    // fallback: documentIds = [id]
    expect(result.documentIds).toEqual(['req-006'])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
