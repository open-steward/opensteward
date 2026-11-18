import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawZorrosignPackage,
} from '../../../../../../../src/verticals/docsign/adapters/zorrosign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('ZorroSign transformEnvelope', () => {
  it('maps a fully-populated package to the canonical Envelope shape', () => {
    const raw: RawZorrosignPackage = {
      package_id: 'zpkg_001',
      title: 'NDA Signing',
      message: 'Please review and sign.',
      status: 'in_progress',
      sender: {
        user_id: 'usr_olivia',
        email: 'olivia@northwind.example',
        name: 'Olivia Admin',
      },
      signing_order: 'sequential',
      template_id: 'ztmpl_msa',
      created_at: '2025-01-15T09:00:00.000Z',
      sent_at: '2025-01-15T09:05:00.000Z',
      completed_at: '2025-02-01T14:20:00.000Z',
      expires_at: '2025-03-01T00:00:00.000Z',
      recipients: [
        { recipient_id: 'rcpt_1', signing_order: 1 },
        { recipient_id: 'rcpt_2', signing_order: 2 },
      ],
      documents: [{ document_id: 'zdoc_a' }, { document_id: 'zdoc_b' }],
      custom_fields: [{ name: 'department', value: 'legal' }],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('zpkg_001')
    expect(result.externalId).toBe('zpkg_001')
    // 'in_progress' → 'sent'
    expect(result.status).toBe('sent')
    expect(result.subject).toBe('NDA Signing')
    expect(result.message).toBe('Please review and sign.')
    expect(result.senderId).toBe('usr_olivia')
    expect(result.senderEmail).toBe('olivia@northwind.example')
    expect(result.senderName).toBe('Olivia Admin')
    expect(result.signingOrder).toBe('sequential')
    expect(result.templateId).toBe('ztmpl_msa')
    // recipients sorted by signing_order
    expect(result.signerIds).toEqual(['rcpt_1', 'rcpt_2'])
    expect(result.documentIds).toEqual(['zdoc_a', 'zdoc_b'])
    expect(result.createdAt).toBe('2025-01-15T09:00:00.000Z')
    expect(result.sentAt).toBe('2025-01-15T09:05:00.000Z')
    expect(result.completedAt).toBe('2025-02-01T14:20:00.000Z')
    expect(result.expiresAt).toBe('2025-03-01T00:00:00.000Z')
    expect(result.platform).toBe('zorrosign')
    // custom_fields merged into metadata
    expect(result.metadata.department).toBe('legal')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string, string]> = [
      ['draft', 'draft'],
      ['created', 'draft'],
      ['sent', 'sent'],
      ['pending', 'sent'],
      ['in_progress', 'sent'],
      ['delivered', 'delivered'],
      ['viewed', 'delivered'],
      ['completed', 'completed'],
      ['signed', 'completed'],
      ['finished', 'completed'],
      ['declined', 'declined'],
      ['rejected', 'declined'],
      ['cancelled', 'voided'],
      ['voided', 'voided'],
      ['expired', 'expired'],
      ['unknown_xyz', 'draft'],
    ]
    for (const [input, expected] of cases) {
      const result = transformEnvelope({ package_id: 'p', status: input })
      expect(result.status, `status=${input}`).toBe(expected)
    }
  })

  it('infers parallel signing from recipients all sharing the same order', () => {
    const raw: RawZorrosignPackage = {
      package_id: 'zpkg_par',
      recipients: [
        { recipient_id: 'r1', signing_order: 1 },
        { recipient_id: 'r2', signing_order: 1 },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('infers sequential signing when recipients have different orders', () => {
    const raw: RawZorrosignPackage = {
      package_id: 'zpkg_seq',
      recipients: [
        { recipient_id: 'r1', signing_order: 1 },
        { recipient_id: 'r2', signing_order: 2 },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('includes decline_reason and cancel_reason in metadata', () => {
    const raw: RawZorrosignPackage = {
      package_id: 'zpkg_dec',
      status: 'declined',
      decline_reason: 'Terms unacceptable',
    }
    const result = transformEnvelope(raw)
    expect(result.metadata.declineReason).toBe('Terms unacceptable')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
