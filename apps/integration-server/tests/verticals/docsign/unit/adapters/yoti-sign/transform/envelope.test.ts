import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawYotiSignEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/yoti-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('yoti-sign transformEnvelope', () => {
  it('maps a completed envelope to canonical Envelope', () => {
    const raw: RawYotiSignEnvelope = {
      envelope_id: 'yoti-env-001',
      status: 'COMPLETE',
      envelope: 'Employment Contract',
      created_at: '2026-01-01T10:00:00.000Z',
      details: {
        recipients: [
          {
            id: 'r-1',
            name: 'Alice Signer',
            email: 'alice@example.com',
            role: 'SIGNER',
            sign_status: 'SIGNED',
          },
          {
            id: 'r-2',
            name: 'Bob CC',
            email: 'bob@example.com',
            role: 'CC',
            sign_status: 'UNSIGNED',
          },
        ],
      },
    }

    const result = transformEnvelope(raw)

    expect(result.id).toBe('yoti-env-001')
    expect(result.externalId).toBe('yoti-env-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Employment Contract')
    // signerIds from recipients
    expect(result.signerIds).toEqual(['r-1', 'r-2'])
    // yoti-sign always parallel
    expect(result.signingOrder).toBe('parallel')
    expect(result.documentIds).toEqual([])
    expect(result.createdAt).toBeDefined()
    expect(result.platform).toBe('yoti-sign')
    expect(result.metadata.rawStatus).toBe('COMPLETE')
    expect(result.metadata.recipientCount).toBe('2')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variations correctly', () => {
    const check = (status: string | undefined) =>
      transformEnvelope({ envelope_id: 'x', status }).status

    expect(check('QUEUED')).toBe('sent')
    expect(check('ACTIVE')).toBe('sent')
    expect(check('COMPLETE')).toBe('completed')
    expect(check('COMPLETED')).toBe('completed')
    // ARCHIVED = voided (cancelled before completion)
    expect(check('ARCHIVED')).toBe('voided')
    expect(check('ERRORED')).toBe('draft')
    expect(check('ERROR')).toBe('draft')
    expect(check(undefined)).toBe('draft')
  })

  it('sets voidedAt when status is voided (ARCHIVED)', () => {
    const raw: RawYotiSignEnvelope = {
      envelope_id: 'yoti-env-002',
      status: 'ARCHIVED',
      archived_at: '2026-01-05T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)
    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBeDefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('does not set voidedAt for non-voided statuses', () => {
    const raw: RawYotiSignEnvelope = {
      envelope_id: 'yoti-env-003',
      status: 'COMPLETE',
      archived_at: '2026-01-05T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)
    expect(result.voidedAt).toBeUndefined()
  })

  it('produces valid envelope when details absent', () => {
    const result = transformEnvelope({ envelope_id: 'yoti-min' })
    expect(result.signerIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
