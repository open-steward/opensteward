import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignableEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/signable/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signable transformEnvelope', () => {
  it('maps a signed envelope to canonical Envelope', () => {
    const raw: RawSignableEnvelope = {
      envelope_fingerprint: 'env-fp-001',
      envelope_title: 'Service Contract',
      envelope_status: 'signed',
      envelope_created: '2026-01-10T09:00:00+0000',
      envelope_sent: '2026-01-10T09:05:00+0000',
      envelope_processed: '2026-01-15T14:00:00+0000',
      envelope_all_at_once_enabled: true,
      envelope_requires_otp: false,
      envelope_parties: [
        {
          party_id: 'party-1',
          contact_email: 'alice@example.com',
          party_status: 'signed',
        },
      ],
      envelope_documents: [
        {
          document_fingerprint: 'doc-fp-1',
          document_title: 'Contract.pdf',
        },
      ],
    }

    const result = transformEnvelope(raw)

    // id maps from envelope_fingerprint
    expect(result.id).toBe('env-fp-001')
    expect(result.externalId).toBe('env-fp-001')
    // 'signed' → 'completed'
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Service Contract')
    // all_at_once_enabled true → parallel
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual(['party-1'])
    expect(result.documentIds).toEqual(['doc-fp-1'])
    expect(result.platform).toBe('signable')
    // completed: processedAt goes to completedAt
    expect(result.completedAt).toBeDefined()

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const check = (envelope_status: string) =>
      transformEnvelope({ envelope_fingerprint: 'x', envelope_status }).status

    expect(check('draft')).toBe('draft')
    expect(check('processing')).toBe('draft')
    expect(check('sent')).toBe('sent')
    expect(check('verify')).toBe('sent')
    expect(check('signed')).toBe('completed')
    expect(check('rejected')).toBe('declined')
    expect(check('cancelled')).toBe('voided')
    expect(check('expired')).toBe('expired')
    expect(check('failed')).toBe('expired')
    // unknown falls back to 'draft'
    expect(check('unknown_state')).toBe('draft')
  })

  it('derives sequential signing order when envelope_all_at_once_enabled is false', () => {
    const result = transformEnvelope({
      envelope_fingerprint: 'x',
      envelope_status: 'sent',
      envelope_all_at_once_enabled: false,
    })
    expect(result.signingOrder).toBe('sequential')
  })

  it('assigns processedAt to declinedAt when status is declined', () => {
    const result = transformEnvelope({
      envelope_fingerprint: 'x',
      envelope_status: 'rejected',
      envelope_processed: '2026-01-20T10:00:00+0000',
    })
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBeDefined()
    expect(result.completedAt).toBeUndefined()
  })

  it('assigns processedAt to voidedAt when status is voided', () => {
    const result = transformEnvelope({
      envelope_fingerprint: 'x',
      envelope_status: 'cancelled',
      envelope_processed: '2026-01-20T10:00:00+0000',
    })
    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBeDefined()
  })

  it('produces empty arrays when parties and documents absent', () => {
    const result = transformEnvelope({
      envelope_fingerprint: 'x',
      envelope_status: 'draft',
    })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
