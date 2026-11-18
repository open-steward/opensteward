import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawAssentlyParty,
} from '../../../../../../../src/verticals/docsign/adapters/assently/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('assently transformSigner', () => {
  it('maps a signed party to canonical Signer', () => {
    const raw: RawAssentlyParty = {
      id: 'pty-001',
      name: 'Alice Smith',
      emailAddress: 'alice@example.com',
      mobilePhone: '+46700000001',
      signedOn: '2026-01-10T00:00:00.000Z',
      signsAs: 0,
      signatureType: 'simple',
      provider: 'email',
      culture: 'en-US',
      reviewed: true,
      ipAddress: '203.0.113.5',
    }

    const result = transformSigner(raw, 'case-001')

    // id is envelopeId:partyId
    expect(result.id).toBe('case-001:pty-001')
    // externalId is raw party id
    expect(result.externalId).toBe('pty-001')
    expect(result.envelopeId).toBe('case-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    // all Assently parties are 'signer'
    expect(result.role).toBe('signer')
    // signedOn present → 'signed'
    expect(result.status).toBe('signed')
    // routingOrder = signsAs (0) + 1 = 1
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('assently')
    expect(result.metadata.ipAddress).toBe('203.0.113.5')
    expect(result.metadata.signatureType).toBe('simple')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status from notificationStatus when not signed', () => {
    const checkEmail = (email: string) =>
      transformSigner({ id: 'p', emailAddress: 'a@b.com', notificationStatus: { email } }, 'env')
        .status

    expect(checkEmail('delivered')).toBe('delivered')
    expect(checkEmail('undeliverable')).toBe('auto_responded')
    expect(checkEmail('sent')).toBe('sent')
    // unknown email status → 'created'
    expect(checkEmail('other')).toBe('created')
  })

  it('signedOn takes priority over notificationStatus for status', () => {
    const result = transformSigner(
      {
        id: 'p',
        emailAddress: 'x@x.com',
        signedOn: '2026-01-10T00:00:00.000Z',
        notificationStatus: { email: 'sent' },
      },
      'env',
    )
    expect(result.status).toBe('signed')
  })

  it('routingOrder is undefined when signsAs absent', () => {
    const result = transformSigner({ id: 'p', emailAddress: 'a@b.com' }, 'env')
    expect(result.routingOrder).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('uses empty string for id and undefined email when absent', () => {
    const result = transformSigner({}, 'env')
    expect(result.id).toBe('env:')
    expect(result.email).toBeUndefined()
    expect(result.name).toBe('')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
