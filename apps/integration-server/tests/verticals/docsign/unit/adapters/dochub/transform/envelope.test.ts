import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  transformFlatEnvelope,
  type RawDochubSignRequest,
} from '../../../../../../../src/verticals/docsign/adapters/dochub/transform/envelope'
import { SIGN_REQUEST } from '../fixtures'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('dochub transformEnvelope', () => {
  it('maps a completed sign request with sequential recipients', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-100',
      title: 'NDA Agreement',
      subject: 'Please sign the NDA',
      message: 'Hi team, please review.',
      status: 'completed',
      sender: { id: 'u-1', email: 'sender@example.com', name: 'Alice Admin' },
      recipients: [
        { id: 'rec-1', email: 'bob@example.com', name: 'Bob', order: 1 },
        { id: 'rec-2', email: 'carol@example.com', name: 'Carol', order: 2 },
      ],
      documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
      created_at: '2025-01-01T00:00:00.000Z',
      sent_at: '2025-01-02T00:00:00.000Z',
      completed_at: '2025-01-10T00:00:00.000Z',
      updated_at: '2025-01-10T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('sr-100')
    expect(result.externalId).toBe('sr-100')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Please sign the NDA')
    expect(result.message).toBe('Hi team, please review.')
    expect(result.senderId).toBe('u-1')
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.senderName).toBe('Alice Admin')
    // sequential because recipients have different order values
    expect(result.signingOrder).toBe('sequential')
    // sorted by order
    expect(result.signerIds).toEqual(['rec-1', 'rec-2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.sentAt).toBe('2025-01-02T00:00:00.000Z')
    expect(result.completedAt).toBe('2025-01-10T00:00:00.000Z')
    expect(result.platform).toBe('dochub')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a sent (pending) status', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-200',
      status: 'pending',
      recipients: [{ id: 'rec-1', order: 0 }],
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided (canceled) status', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-300',
      status: 'canceled',
      cancel_reason: 'Sent by mistake',
      canceled_at: '2025-03-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2025-03-01T00:00:00.000Z')
    expect(result.metadata.cancelReason).toBe('Sent by mistake')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined status', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-400',
      status: 'declined',
      declined_at: '2025-04-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-04-01T00:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('respects explicit signing_order=sequential field', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-500',
      status: 'sent',
      signing_order: 'sequential',
      recipients: [
        { id: 'rec-1', order: 0 },
        { id: 'rec-2', order: 0 },
      ],
    }
    const result = transformEnvelope(raw)

    // explicit signing_order wins even if all recipients have same order
    expect(result.signingOrder).toBe('sequential')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an expired status', () => {
    const raw: RawDochubSignRequest = {
      id: 'sr-600',
      status: 'expired',
      expires_at: '2024-12-31T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('expired')
    expect(result.expiresAt).toBe('2024-12-31T00:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

/**
 * transformFlatEnvelope maps DocHub's documented flat sign request
 * (`sign_request_flat_resource`, the `application/json` body of
 * GET /api/v2/sign-requests/{id} and POST /api/v2/sign-requests/{id}/void).
 * SIGN_REQUEST is that operation's documented flat-JSON example.
 */
describe('dochub transformFlatEnvelope', () => {
  it('maps the documented flat example', () => {
    const e = EnvelopeSchema.parse(transformFlatEnvelope(SIGN_REQUEST))
    expect(e.id).toBe('sr123abc')
    expect(e.externalId).toBe('sr123abc')
    // IN_PROGRESS: sent, awaiting signers ("Voids an in-progress sign request").
    expect(e.status).toBe('sent')
    expect(e.subject).toBe('ACTION NEEDED: Contract Agreement')
    expect(e.message).toBe('Please review, sign, and complete this document.')
    expect(e.senderId).toBe('user456def')
    expect(e.signingOrder).toBe('parallel')
    expect(e.signerIds).toEqual(['sr123abc:signer789ghi'])
    expect(e.documentIds).toEqual(['sr123abc:doc123abc'])
    expect(e.createdAt).toBe('2024-01-15T10:30:00.000Z')
    expect(e.updatedAt).toBe('2024-01-20T14:45:00.000Z')
    expect(e.metadata).toEqual({ status: 'IN_PROGRESS' })
    expect(e.platform).toBe('dochub')
  })

  it('hasQueue true is sequential ("Whether signing is configured sequentially")', () => {
    expect(transformFlatEnvelope({ ...SIGN_REQUEST, hasQueue: true }).signingOrder).toBe(
      'sequential',
    )
  })

  it.each([
    ['PREPARING', 'draft'],
    ['IN_PROGRESS', 'sent'],
    ['FINALIZED', 'completed'],
    ['REJECTED', 'declined'],
    ['VOIDED', 'voided'],
    ['EXPIRED', 'expired'],
    ['ERROR', 'unknown'],
    ['BOUNCE', 'unknown'],
  ])('status %s -> %s', (status, expected) => {
    const e = EnvelopeSchema.parse(transformFlatEnvelope({ ...SIGN_REQUEST, status }))
    expect(e.status).toBe(expected)
    expect(e.metadata.status).toBe(status)
  })

  it('a missing emailContent is an empty subject, not a guessed one', () => {
    const e = EnvelopeSchema.parse(transformFlatEnvelope({ ...SIGN_REQUEST, emailContent: null }))
    expect(e.subject).toBe('')
    expect(e.message).toBeUndefined()
  })

  it('an empty emailContent body is no message', () => {
    const e = transformFlatEnvelope({ ...SIGN_REQUEST, emailContent: { subject: 'S', body: '' } })
    expect(e.subject).toBe('S')
    expect('message' in e).toBe(false)
  })
})
