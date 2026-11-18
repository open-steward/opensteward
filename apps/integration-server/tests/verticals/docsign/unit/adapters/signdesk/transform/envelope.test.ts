import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSigndeskRequest,
} from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signdesk transformEnvelope', () => {
  it('maps a completed request with signatories to canonical Envelope', () => {
    const raw: RawSigndeskRequest = {
      request_id: 'req-001',
      document_name: 'Service Agreement',
      request_status: 'completed',
      initiator_id: 'user-1',
      initiator_name: 'Admin User',
      initiator_email: 'admin@example.com',
      signing_type: 'sequential',
      created_on: '2025-04-01T09:00:00.000Z',
      updated_on: '2025-04-05T14:00:00.000Z',
      completed_on: '2025-04-05T14:00:00.000Z',
      signatories: [
        { signatory_id: 'sig-1', signing_sequence: 1 },
        { signatory_id: 'sig-2', signing_sequence: 2 },
      ],
      documents: [{ document_id: 'doc-1' }, { document_id: 'doc-2' }],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('req-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Service Agreement')
    expect(result.senderEmail).toBe('admin@example.com')
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['sig-1', 'sig-2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.completedAt).toBe('2025-04-05T14:00:00.000Z')
    expect(result.platform).toBe('signdesk')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending request with inferred parallel signing', () => {
    const raw: RawSigndeskRequest = {
      request_id: 'req-002',
      request_status: 'pending',
      signatories: [
        { signatory_id: 'sig-3', signing_sequence: 0 },
        { signatory_id: 'sig-4', signing_sequence: 0 },
      ],
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('ignores non-email initiator_email', () => {
    const raw: RawSigndeskRequest = {
      request_id: 'req-003',
      initiator_email: 'not-an-email',
      request_status: 'draft',
    }
    const result = transformEnvelope(raw)

    expect(result.senderEmail).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to reference_number for id when request_id is absent', () => {
    const raw: RawSigndeskRequest = {
      reference_number: 'REF-999',
      request_status: 'sent',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('REF-999')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
