import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signable/transform/signer'
import type { RawSignableEnvelopeParty } from '../../../../../../../src/verticals/docsign/adapters/signable/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signable transformSigner', () => {
  it('maps a signed party to canonical Signer', () => {
    const raw: RawSignableEnvelopeParty = {
      party_id: 'party-001',
      party_title: 'Alice Smith',
      contact_email: 'alice@example.com',
      party_status: 'signed',
      party_role: 'signer',
      party_signature_type: 'electronic',
      contact_id: 'c-1',
    }

    const result = transformSigner(raw, 'env-fp-001', 0)

    // id is composed of envelopeId + party_id
    expect(result.id).toBe('env-fp-001:party-001')
    expect(result.externalId).toBe('party-001')
    expect(result.envelopeId).toBe('env-fp-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    // signer role (not 'copy')
    expect(result.role).toBe('signer')
    // party_status 'signed' → 'signed'
    expect(result.status).toBe('signed')
    // index 0 → routingOrder 1
    expect(result.routingOrder).toBe(1)
    expect(result.platform).toBe('signable')
    expect(result.metadata.partyRole).toBe('signer')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps copy party_role to cc', () => {
    const raw: RawSignableEnvelopeParty = {
      party_id: 'party-cc',
      contact_email: 'cc@example.com',
      party_role: 'copy',
    }
    const result = transformSigner(raw, 'env-1', 1)
    expect(result.role).toBe('cc')
    expect(result.routingOrder).toBe(2)
  })

  it('maps party_status variants correctly', () => {
    const check = (party_status: string | undefined) =>
      transformSigner({ party_id: 'x', contact_email: 'a@b.com', party_status }, 'env', 0).status

    expect(check('signed')).toBe('signed')
    expect(check('in progress')).toBe('delivered')
    expect(check('pending')).toBe('sent')
    // unknown → created
    expect(check(undefined)).toBe('created')
    expect(check('other')).toBe('created')
  })

  it('defaults email to undefined and name to empty string when absent', () => {
    const raw: RawSignableEnvelopeParty = { party_id: 'party-x' }
    const result = transformSigner(raw, 'env-1', 0)
    expect(result.email).toBeUndefined()
    expect(result.name).toBe('')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
