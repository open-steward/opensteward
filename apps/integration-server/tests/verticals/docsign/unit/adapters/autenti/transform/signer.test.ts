import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/autenti/transform/signer'
import { documentProcessInProgress } from '../fixtures'

const ENV = 'DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42'

describe('Autenti transformSigner (DocumentProcessParty)', () => {
  it('maps the documented SIGNER party', () => {
    const party = documentProcessInProgress().parties[2]!
    const out = SignerSchema.parse(transformSigner(party, ENV))
    expect(out.id).toBe('PARTY-PUBLIC_SIGNING_PROCESS_ID:bdb551b2')
    expect(out.envelopeId).toBe(ENV)
    expect(out.name).toBe('Maurice Chevaller')
    expect(out.email).toBe('chevallier1981@gmail.com')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('sent')
    expect(out.routingOrder).toBe(3)
    expect(out.metadata).toEqual({ role: 'SIGNER', participationStatus: 'PENDING' })
  })

  it('maps the documented APPROVER party', () => {
    const out = SignerSchema.parse(transformSigner(documentProcessInProgress().parties[0]!, ENV))
    expect(out.role).toBe('approver')
    expect(out.status).toBe('signed')
    expect(out.routingOrder).toBe(1)
  })

  it.each([
    ['NONE', 'created'],
    ['PENDING', 'sent'],
    ['COMPLETED', 'signed'],
    ['OBSOLETE', 'unknown'],
    ['FAILED', 'unknown'],
  ])('maps ParticipationStatus %s to %s', (participationStatus, expected) => {
    const party = { ...documentProcessInProgress().parties[1]!, participationStatus }
    expect(SignerSchema.parse(transformSigner(party, ENV)).status).toBe(expected)
  })

  it.each([
    ['SIGNER', 'signer'],
    ['APPROVER', 'approver'],
    ['VIEWER', 'cc'],
    ['REVIEWER', 'unknown'],
  ])('maps role %s to %s', (role, expected) => {
    const party = { ...documentProcessInProgress().parties[1]!, role }
    expect(SignerSchema.parse(transformSigner(party, ENV)).role).toBe(expected)
  })

  it('omits the email when the party has no e-mail contact', () => {
    const p = documentProcessInProgress().parties[1]!
    const out = SignerSchema.parse(
      transformSigner({ ...p, party: { ...p.party, contacts: [] } }, ENV),
    )
    expect(out.email).toBeUndefined()
  })

  it('throws rather than inventing an id or a name', () => {
    const p = documentProcessInProgress().parties[1]!
    expect(() => transformSigner({ ...p, party: { ...p.party, id: undefined } }, ENV)).toThrow(
      /no id/,
    )
    expect(() => transformSigner({ ...p, party: { ...p.party, name: undefined } }, ENV)).toThrow(
      /no name/,
    )
  })
})
