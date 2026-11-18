import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawZefortEsign,
} from '../../../../../../../src/verticals/docsign/adapters/zefort/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('Zefort transformEnvelope', () => {
  it('maps a fully-populated esign to the canonical Envelope shape', () => {
    const raw: RawZefortEsign = {
      id: 'esgn_001',
      owner: 'user_alice',
      subject: 'Master Services Agreement',
      message: 'Please sign at your earliest convenience.',
      status: 'pending',
      sign_order: 'consecutive',
      contract: 'cntr_42',
      parties: [
        { id: 'sgnr_1', email: 'bob@example.com' },
        { id: 'sgnr_2', email: 'carol@example.com' },
      ],
      documents: [{ id: 'esdc_a' }, { id: 'esdc_b' }],
      created: '2025-01-15T09:00:00Z',
      activated: '2025-01-15T09:05:00Z',
      completed: '2025-02-01T14:20:00Z',
      deadline: '2025-03-01T00:00:00Z',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('esgn_001')
    expect(result.externalId).toBe('esgn_001')
    // 'pending' → 'sent'
    expect(result.status).toBe('sent')
    expect(result.subject).toBe('Master Services Agreement')
    expect(result.message).toBe('Please sign at your earliest convenience.')
    expect(result.senderId).toBe('user_alice')
    // 'consecutive' → 'sequential'
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['sgnr_1', 'sgnr_2'])
    expect(result.documentIds).toEqual(['esdc_a', 'esdc_b'])
    // ISO timestamps
    expect(result.createdAt).toBe('2025-01-15T09:00:00.000Z')
    expect(result.sentAt).toBe('2025-01-15T09:05:00.000Z')
    expect(result.completedAt).toBe('2025-02-01T14:20:00.000Z')
    expect(result.expiresAt).toBe('2025-03-01T00:00:00.000Z')
    expect(result.platform).toBe('zefort')
    expect(result.metadata.contract).toBe('cntr_42')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string, string]> = [
      ['draft', 'draft'],
      ['completed', 'completed'],
      ['declined', 'declined'],
      ['cancelled', 'voided'],
      ['expired', 'expired'],
      ['failed', 'unknown'],
      ['whatever', 'draft'],
    ]
    for (const [input, expected] of cases) {
      const result = transformEnvelope({ id: 'esgn_x', status: input })
      expect(result.status).toBe(expected)
    }
  })

  it('maps parallel signing when sign_order is not "consecutive"', () => {
    const result = transformEnvelope({ id: 'esgn_par', sign_order: 'parallel' })
    expect(result.signingOrder).toBe('parallel')
    // parties fallback to empty → signerIds is empty
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses completed or signed for completedAt (completed preferred)', () => {
    const withCompleted = transformEnvelope({
      id: 'e1',
      completed: '2025-06-01T00:00:00Z',
      signed: '2025-05-31T00:00:00Z',
    })
    expect(withCompleted.completedAt).toBe('2025-06-01T00:00:00.000Z')

    const signedOnly = transformEnvelope({ id: 'e2', signed: '2025-05-31T00:00:00Z' })
    expect(signedOnly.completedAt).toBe('2025-05-31T00:00:00.000Z')
  })
})
