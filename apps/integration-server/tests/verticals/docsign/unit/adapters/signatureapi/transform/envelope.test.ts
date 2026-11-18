import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignatureapiEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/signatureapi/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signatureapi transformEnvelope', () => {
  it('maps a completed envelope to canonical Envelope', () => {
    const raw: RawSignatureapiEnvelope = {
      id: 'env-001',
      status: 'completed',
      mode: 'live',
      title: 'Service Agreement',
      label: 'sa-2026',
      message: 'Please sign the attached agreement.',
      routing: 'sequential',
      language: 'en',
      timezone: 'UTC',
      sender: {
        name: 'Alice Admin',
        email: 'alice@example.com',
        organization: 'Acme Corp',
      },
      recipients: [
        { id: 'rec-1', status: 'completed' },
        { id: 'rec-2', status: 'completed' },
      ],
      documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
      topics: ['legal', 'hr'],
      created_at: '2026-01-10T09:00:00.000Z',
      completed_at: '2026-01-20T14:00:00.000Z',
      expires_at: '2026-02-10T09:00:00.000Z',
    }

    const result = transformEnvelope(raw)

    // id maps from raw.id
    expect(result.id).toBe('env-001')
    expect(result.externalId).toBe('env-001')
    // completed → 'completed'
    expect(result.status).toBe('completed')
    // subject from title
    expect(result.subject).toBe('Service Agreement')
    expect(result.message).toBe('Please sign the attached agreement.')
    expect(result.senderEmail).toBe('alice@example.com')
    expect(result.senderName).toBe('Alice Admin')
    // routing 'sequential'
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['rec-1', 'rec-2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.platform).toBe('signatureapi')
    expect(result.metadata.mode).toBe('live')
    expect(result.metadata.senderOrganization).toBe('Acme Corp')
    expect(result.metadata.topics).toBe('legal,hr')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ id: 'x', status }).status

    expect(check('processing')).toBe('sent')
    expect(check('in_progress')).toBe('delivered')
    expect(check('completed')).toBe('completed')
    expect(check('canceled')).toBe('voided')
    expect(check('cancelled')).toBe('voided')
    expect(check('failed')).toBe('expired')
    // unknown falls back to 'sent'
    expect(check(undefined)).toBe('sent')
    expect(check('something_else')).toBe('sent')
  })

  it('derives declined status from declined_at presence', () => {
    const result = transformEnvelope({
      id: 'x',
      status: 'in_progress',
      declined_at: '2026-01-15T10:00:00.000Z',
    })
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBeDefined()
  })

  it('derives declined status from a rejected recipient when not already completed', () => {
    const result = transformEnvelope({
      id: 'x',
      status: 'in_progress',
      recipients: [{ id: 'r1', status: 'rejected' }],
    })
    expect(result.status).toBe('declined')
  })

  it('does NOT override completed status even if a recipient is rejected', () => {
    // declined_at absent + status=completed → should stay completed
    const result = transformEnvelope({
      id: 'x',
      status: 'completed',
      recipients: [{ id: 'r1', status: 'rejected' }],
    })
    expect(result.status).toBe('completed')
  })

  it('uses routing=parallel when routing field not sequential', () => {
    expect(transformEnvelope({ id: 'x', routing: 'parallel' }).signingOrder).toBe('parallel')
    expect(transformEnvelope({ id: 'x' }).signingOrder).toBe('parallel')
  })

  it('uses label as fallback subject when title absent', () => {
    const result = transformEnvelope({ id: 'x', label: 'my-label' })
    expect(result.subject).toBe('my-label')
  })

  it('produces empty arrays when recipients and documents absent', () => {
    const result = transformEnvelope({ id: 'x' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
