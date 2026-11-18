import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawAnnatureRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/annature/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { RECIPIENT_EXAMPLE } from './fixtures'

const recipient = RECIPIENT_EXAMPLE as RawAnnatureRecipient

describe('annature transformSigner', () => {
  it('maps the documented recipient example onto the canonical schema', () => {
    const out = SignerSchema.parse(transformSigner(recipient, 'env-1'))
    expect(out.id).toBe('255e591c2c9fe1bc99be1ec03075b402')
    expect(out.externalId).toBe('255e591c2c9fe1bc99be1ec03075b402')
    expect(out.envelopeId).toBe('env-1')
    expect(out.email).toBe('ted@annature.com.au')
    expect(out.name).toBe('Ted Annature')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('sent')
    expect(out.routingOrder).toBe(1)
    expect(out.sentAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.signedAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.declinedAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.declineReason).toBe('Lorem ipsum dolor sit amet.')
    expect(out.metadata).toEqual({ type: 'signer', muted: 'false' })
    expect(out.platform).toBe('annature')
  })

  it.each([
    ['created', 'created'],
    ['pending', 'created'],
    ['sent', 'sent'],
    ['failed', 'unknown'],
    ['completed', 'signed'],
    ['declined', 'declined'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...recipient, status }, 'e')).status).toBe(expected)
  })

  it.each([
    ['signer', 'signer'],
    ['carbon-copy', 'cc'],
    ['viewer', 'unknown'],
  ])('maps documented type %s to role %s', (type, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...recipient, type }, 'e')).role).toBe(expected)
  })

  it('a carbon-copy recipient without a status maps to unknown and still parses', () => {
    const { status: _s, ...cc } = { ...recipient, type: 'carbon-copy' }
    const out = SignerSchema.parse(transformSigner(cc as RawAnnatureRecipient, 'e'))
    expect(out.status).toBe('unknown')
  })

  it('omits a null email instead of emitting an empty string', () => {
    const out = SignerSchema.parse(transformSigner({ ...recipient, email: null }, 'e'))
    expect(out).not.toHaveProperty('email', '')
    expect(out.email).toBeUndefined()
  })
})
