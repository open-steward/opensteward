/** Fixtures: see ../fixtures.ts (DocHub documented examples). */
import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/dochub/transform/signer'
import { SIGNER_FINALIZED, SIGNER_PENDING } from '../fixtures'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('dochub transformSigner', () => {
  it('maps the documented flat signersData example', () => {
    const s = SignerSchema.parse(transformSigner(SIGNER_PENDING, 'sr123abc'))
    expect(s.id).toBe('sr123abc:signer789ghi')
    expect(s.externalId).toBe('signer789ghi')
    expect(s.envelopeId).toBe('sr123abc')
    expect(s.email).toBe('signer1@example.com')
    expect(s.name).toBe('John Doe')
    expect(s.role).toBe('signer')
    // `pending` has no documented meaning beyond the word; not guessed as sent.
    expect(s.status).toBe('unknown')
    expect(s.metadata.status).toBe('pending')
    expect(s.routingOrder).toBeUndefined()
    expect(s.deliveredAt).toBe('2024-01-18T09:15:00.000Z')
    expect(s.signedAt).toBeUndefined()
    expect(s.sentAt).toBeUndefined()
    expect(s.platform).toBe('dochub')
  })

  it('maps a finalized signer to signed with its signedAt', () => {
    const s = SignerSchema.parse(transformSigner(SIGNER_FINALIZED, 'sr123abc'))
    expect(s.status).toBe('signed')
    expect(s.signedAt).toBe('2024-01-18T14:30:00.000Z')
    expect(s.metadata.finalizationMessage).toBe('Approved')
  })

  it('maps rejected to declined and EMAIL_READ to delivered, case-insensitively', () => {
    expect(
      SignerSchema.parse(transformSigner({ ...SIGNER_PENDING, status: 'rejected' }, 'sr')).status,
    ).toBe('declined')
    expect(
      SignerSchema.parse(transformSigner({ ...SIGNER_PENDING, status: 'EMAIL_READ' }, 'sr')).status,
    ).toBe('delivered')
    expect(
      SignerSchema.parse(transformSigner({ ...SIGNER_PENDING, status: 'BOUNCE' }, 'sr')).status,
    ).toBe('unknown')
  })

  it('reads queuePosition as the routing order', () => {
    const s = SignerSchema.parse(transformSigner({ ...SIGNER_FINALIZED, queuePosition: 1 }, 'sr'))
    expect(s.routingOrder).toBe(1)
  })

  it('omits a null email (documented for in_person signers) and keeps a null name empty', () => {
    const s = SignerSchema.parse(
      transformSigner({ ...SIGNER_PENDING, email: null, name: null }, 'sr'),
    )
    expect(s.email).toBeUndefined()
    expect(s.name).toBe('')
  })

  it('reads the documented -06:00 offset timestamps', () => {
    const s = SignerSchema.parse(
      transformSigner({ ...SIGNER_PENDING, viewedAt: '2024-01-18T09:15:00.000-06:00' }, 'sr'),
    )
    expect(s.deliveredAt).toBe('2024-01-18T15:15:00.000Z')
  })
})
