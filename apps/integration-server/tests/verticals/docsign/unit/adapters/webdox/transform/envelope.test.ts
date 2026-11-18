import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawWebdoxWorkflow,
} from '../../../../../../../src/verticals/docsign/adapters/webdox/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('webdox transformEnvelope', () => {
  it('maps a completed workflow to canonical Envelope', () => {
    const raw: RawWebdoxWorkflow = {
      id: 42,
      name: 'Supplier Agreement',
      decision_name: 'Approve and Sign',
      status: 'completed',
      template_id: 99,
      requester_id: 7,
      requester_email: 'alice@example.com',
      requester_name: 'Alice Admin',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-10T10:00:00.000Z',
      completed_at: '2026-01-10T10:00:00.000Z',
      limit_date: '2026-03-01T00:00:00.000Z',
      steps: [
        {
          id_number: 1,
          step_type: 'signature',
          is_signature_step: true,
          signers: [{ id: 10 }, { id: 11 }],
        },
        {
          id_number: 2,
          step_type: 'signature',
          is_signature_step: true,
          signers: [{ id: 12 }],
        },
      ],
      documents: [{ id: 101 }, { id: 102 }],
    }

    const result = transformEnvelope(raw)

    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
    expect(result.status).toBe('completed')
    // name takes priority for subject
    expect(result.subject).toBe('Supplier Agreement')
    expect(result.message).toBe('Approve and Sign')
    expect(result.senderId).toBe('7')
    expect(result.senderEmail).toBe('alice@example.com')
    expect(result.senderName).toBe('Alice Admin')
    // two distinct step numbers → sequential
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['10', '11', '12'])
    expect(result.documentIds).toEqual(['101', '102'])
    expect(result.templateId).toBe('99')
    expect(result.completedAt).toBeDefined()
    expect(result.expiresAt).toBeDefined()
    expect(result.platform).toBe('webdox')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variations correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ id: 1, status }).status

    expect(check('draft')).toBe('draft')
    expect(check('created')).toBe('draft')
    expect(check('pending')).toBe('draft')
    expect(check('started')).toBe('sent')
    expect(check('in_progress')).toBe('sent')
    expect(check('running')).toBe('sent')
    expect(check('sent')).toBe('sent')
    expect(check('completed')).toBe('completed')
    expect(check('finished')).toBe('completed')
    expect(check('signed')).toBe('completed')
    expect(check('closed')).toBe('completed')
    expect(check('rejected')).toBe('declined')
    expect(check('declined')).toBe('declined')
    expect(check('canceled')).toBe('voided')
    expect(check('cancelled')).toBe('voided')
    expect(check('voided')).toBe('voided')
    expect(check('expired')).toBe('expired')
    expect(check(undefined)).toBe('draft')
  })

  it('detects parallel signing when only one step has signers', () => {
    const raw: RawWebdoxWorkflow = {
      id: 2,
      steps: [{ id_number: 1, signers: [{ id: 5 }, { id: 6 }] }],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('uses voidedAt from canceled_at', () => {
    const raw: RawWebdoxWorkflow = {
      id: 3,
      status: 'canceled',
      canceled_at: '2026-02-01T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBeDefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('produces valid envelope with minimal fields', () => {
    const result = transformEnvelope({ id: 99 })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
