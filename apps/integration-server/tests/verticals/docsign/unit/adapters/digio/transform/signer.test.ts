import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawDigioSigningParty,
} from '../../../../../../../src/verticals/docsign/adapters/digio/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { documentDetails } from '../fixtures'

const DOC = 'DID2409241200000000AB'
const [emailParty, mobileParty] = documentDetails(DOC).signing_parties as RawDigioSigningParty[]

describe('Digio transformSigner (SigningPartyDetailsV2)', () => {
  it('maps an email-identified signed party and parses as a canonical Signer', () => {
    const out = SignerSchema.parse(transformSigner(emailParty!, DOC))
    expect(out).toMatchObject({
      id: `${DOC}:asha@example.com`,
      externalId: 'asha@example.com',
      envelopeId: DOC,
      email: 'asha@example.com',
      name: 'Asha Rao',
      role: 'signer',
      status: 'signed',
      platform: 'digio',
      metadata: {
        identifier: 'asha@example.com',
        type: 'self',
        status: 'signed',
        signatureType: 'aadhaar',
        signatureMode: 'otp',
        reason: 'Loan agreement',
        expireOn: '2026-10-04 12:00:00',
      },
    })
    // No signing timestamp is documented on a signing party.
    expect(out.signedAt).toBeUndefined()
  })

  it('omits email when the identifier is a mobile number', () => {
    const out = SignerSchema.parse(transformSigner(mobileParty!, DOC))
    expect(out.email).toBeUndefined()
    expect(out.externalId).toBe('9876543210')
    expect(out.status).toBe('sent')
  })

  it.each([
    ['requested', 'sent'],
    ['signed', 'signed'],
    ['sequenced', 'created'],
    ['expired', 'unknown'],
    ['cancelled', 'unknown'],
    ['removed', 'unknown'],
    ['failed', 'unknown'],
    ['skipped', 'unknown'],
  ])('status %s maps to %s', (status, expected) => {
    const out = SignerSchema.parse(transformSigner({ ...emailParty!, status }, DOC))
    expect(out.status).toBe(expected)
  })

  it('throws rather than invent an id when the identifier is absent', () => {
    expect(() => transformSigner({ name: 'No Id', status: 'requested' }, DOC)).toThrow(/identifier/)
  })

  it('throws rather than invent a name when the name is absent', () => {
    expect(() =>
      transformSigner({ identifier: 'x@example.com', status: 'requested' }, DOC),
    ).toThrow(/name/)
  })
})
