/**
 * Signhost Signer -> canonical Signer, from the documented example (see
 * ./fixtures.ts) and the Signer model
 * (https://developer.signhost.com/openapi/models/Signer.md).
 */
import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signhost/transform/signer'
import { TRANSACTION_EXAMPLE, exampleTransaction } from './fixtures'

const ENV = TRANSACTION_EXAMPLE.Id
const signer = () => exampleTransaction().Signers[0]!

describe('Signhost transformSigner', () => {
  it('maps the documented example signer', () => {
    const out = SignerSchema.parse(transformSigner(TRANSACTION_EXAMPLE.Signers[0]!, ENV))
    expect(out.id).toBe('fa95495d-6c59-48e0-962a-a4552f8d6b85')
    expect(out.externalId).toBe(out.id)
    expect(out.envelopeId).toBe(ENV)
    expect(out.email).toBe('user@example.com')
    // The Signer model documents no name field; its identity is the Email.
    expect(out.name).toBe('user@example.com')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2016-06-15T21:38:10.000Z')
    // 101 Invitation sent, 103 Opened
    expect(out.sentAt).toBe('2016-06-15T21:30:00.000Z')
    expect(out.deliveredAt).toBe('2016-06-15T21:33:04.196Z')
    expect(out.declinedAt).toBeUndefined()
    expect(out.platform).toBe('signhost')
  })

  it('is declined from RejectDateTime with its RejectReason', () => {
    const raw = {
      ...signer(),
      SignedDateTime: null,
      RejectDateTime: '2016-06-15T23:39:00+02:00',
      RejectReason: 'Wrong amount',
      Activities: signer().Activities.slice(0, 2),
    }
    const out = SignerSchema.parse(transformSigner(raw, ENV))
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2016-06-15T21:39:00.000Z')
    expect(out.declineReason).toBe('Wrong amount')
  })

  it.each([
    [[], 'created'],
    [[101], 'sent'],
    [[101, 104], 'sent'],
    [[101, 103], 'delivered'],
    [[105], 'delivered'],
  ] as const)('derives status from activity codes %j -> %s', (codes, expected) => {
    const raw = {
      ...signer(),
      SignedDateTime: null,
      Activities: codes.map((Code, i) => ({
        Id: `act-${i}`,
        Code,
        Activity: 'x',
        CreatedDateTime: '2016-06-15T23:30:00+02:00',
      })),
    }
    expect(SignerSchema.parse(transformSigner(raw, ENV)).status).toBe(expected)
  })

  it('throws on a signer without the documented Id', () => {
    const { Id: _id, ...raw } = signer()
    expect(() => transformSigner(raw as never, ENV)).toThrow(/Id/)
  })

  it('throws on a signer without the mandatory Email', () => {
    const { Email: _e, ...raw } = signer()
    expect(() => transformSigner(raw as never, ENV)).toThrow(/Email/)
  })
})

describe('Signhost transformSigner (review follow-ups)', () => {
  const act = (Code: number) => ({
    Id: `act-${Code}`,
    Code,
    Activity: 'x',
    CreatedDateTime: '2016-06-15T23:30:00+02:00',
  })

  it('is signed from activity 203 ("Signed") when SignedDateTime is null', () => {
    const raw = { ...signer(), SignedDateTime: null, Activities: [act(101), act(203)] }
    expect(SignerSchema.parse(transformSigner(raw, ENV)).status).toBe('signed')
  })

  it('is declined from activity 202 ("Rejected") when RejectDateTime is null', () => {
    const raw = {
      ...signer(),
      SignedDateTime: null,
      RejectDateTime: null,
      Activities: [act(101), act(202)],
    }
    expect(SignerSchema.parse(transformSigner(raw, ENV)).status).toBe('declined')
  })

  it('carries no signing or download URL in raw', () => {
    const out = SignerSchema.parse(transformSigner(signer(), ENV))
    for (const k of ['SignUrl', 'DelegateSignUrl', 'ShowUrl', 'ReceiptUrl']) {
      expect(out.raw).not.toHaveProperty(k)
    }
    expect(JSON.stringify(out.raw)).not.toContain('view.signhost.com')
    expect((out.raw as Record<string, unknown>)['Email']).toBe('user@example.com')
  })
})
