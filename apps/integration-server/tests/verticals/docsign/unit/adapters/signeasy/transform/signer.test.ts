/**
 * SignEasy signer transform over the documented `recipients[]` of
 * GET /rs/envelope/{pending_file_id}
 * (https://docs.signeasy.com/reference/fetch-envelope-rs-details.md).
 */
import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signeasy/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { FETCH_ENVELOPE_EXAMPLE, LIST_ENVELOPES_EXAMPLE } from '../signeasy.fixture'

const recipient = FETCH_ENVELOPE_EXAMPLE.recipients[0]!

describe('signeasy transformSigner', () => {
  it('maps a documented recipient', () => {
    const out = SignerSchema.parse(transformSigner(recipient, '200000001'))
    expect(out.id).toBe('300000001')
    expect(out.externalId).toBe('300000001')
    expect(out.envelopeId).toBe('200000001')
    expect(out.email).toBe('signer.one@example.com')
    expect(out.name).toBe('Signer One')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('sent')
    expect(out.routingOrder).toBe(1)
    expect(out.declineReason).toBeUndefined()
    expect(out.metadata).toEqual({ recipientUserId: '500001' })
  })

  it('keeps the documented group_id', () => {
    const out = SignerSchema.parse(transformSigner(FETCH_ENVELOPE_EXAMPLE.recipients[2]!, '1'))
    expect(out.metadata['groupId']).toBe('900001')
  })

  it('maps the documented viewed status', () => {
    const out = SignerSchema.parse(
      transformSigner(LIST_ENVELOPES_EXAMPLE.files[0]!.recipients[0]!, '240300'),
    )
    expect(out.status).toBe('delivered')
  })

  it.each([
    ['not_viewed', 'sent'],
    ['viewed', 'delivered'],
    ['finalized', 'signed'],
    ['declined', 'declined'],
    ['something_new', 'unknown'],
  ])('maps documented recipient status %s to %s', (status, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...recipient, status }, '1')).status).toBe(expected)
  })

  it('maps decline_message to declineReason', () => {
    const out = transformSigner(
      { ...recipient, status: 'declined', decline_message: 'Wrong terms' },
      '1',
    )
    expect(out.declineReason).toBe('Wrong terms')
  })

  it('leaves routingOrder unset for order_id 0, which is below the 1-based order', () => {
    expect(transformSigner({ ...recipient, order_id: 0 }, '1').routingOrder).toBeUndefined()
  })

  it('throws on a recipient without recipient_id', () => {
    expect(() => transformSigner({ ...recipient, recipient_id: undefined }, '1')).toThrow(
      /recipient_id/,
    )
  })
})
