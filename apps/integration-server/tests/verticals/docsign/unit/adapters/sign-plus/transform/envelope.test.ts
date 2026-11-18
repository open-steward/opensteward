import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignPlusEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/sign-plus/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('sign-plus transformEnvelope', () => {
  it('maps a completed envelope to canonical Envelope', () => {
    const raw: RawSignPlusEnvelope = {
      id: 'env-001',
      name: 'Annual Contract',
      comment: 'Please review carefully.',
      status: 'COMPLETED',
      flow_type: 'STANDARD',
      legality_level: 'SES',
      created_at: 1735689600, // 2025-01-01T00:00:00Z
      updated_at: 1735776000, // 2025-01-02T00:00:00Z
      expires_at: 1738368000, // 2025-02-01T00:00:00Z
      pages: 5,
      num_recipients: 2,
      notification: {
        subject: 'Please sign the Annual Contract',
        message: 'Kindly sign.',
        reminder_interval: 3,
      },
      signing_steps: [{ recipients: [{ id: 'r1' }] }, { recipients: [{ id: 'r2' }] }],
      documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
    }

    const result = transformEnvelope(raw)

    // id maps directly from raw.id
    expect(result.id).toBe('env-001')
    expect(result.externalId).toBe('env-001')
    // COMPLETED → 'completed'
    expect(result.status).toBe('completed')
    // subject prefers notification.subject over name
    expect(result.subject).toBe('Please sign the Annual Contract')
    expect(result.message).toBe('Kindly sign.')
    // two signing steps → sequential
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['r1', 'r2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.platform).toBe('sign-plus')
    expect(result.metadata.legalityLevel).toBe('SES')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ id: 'x', status }).status

    expect(check('DRAFT')).toBe('draft')
    expect(check('PENDING')).toBe('sent')
    expect(check('IN_PROGRESS')).toBe('sent')
    expect(check('COMPLETED')).toBe('completed')
    expect(check('DECLINED')).toBe('declined')
    expect(check('VOIDED')).toBe('voided')
    expect(check('EXPIRED')).toBe('expired')
    // unknown falls back to 'draft'
    expect(check(undefined)).toBe('draft')
    expect(check('something_else')).toBe('draft')
  })

  it('uses name as fallback subject when notification.subject absent', () => {
    const result = transformEnvelope({ id: 'x', name: 'The Contract' })
    expect(result.subject).toBe('The Contract')
  })

  it('uses parallel signing order when only one signing step', () => {
    const result = transformEnvelope({
      id: 'x',
      signing_steps: [{ recipients: [{ id: 'r1' }, { id: 'r2' }] }],
    })
    expect(result.signingOrder).toBe('parallel')
    expect(result.signerIds).toEqual(['r1', 'r2'])
  })

  it('produces empty arrays when signing_steps and documents absent', () => {
    const result = transformEnvelope({ id: 'x' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
