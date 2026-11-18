import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawZefortParty,
} from '../../../../../../../src/verticals/docsign/adapters/zefort/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('Zefort transformSigner', () => {
  it('maps a fully-populated party to the canonical Signer shape', () => {
    const raw: RawZefortParty = {
      id: 'sgnr_abc',
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone_number: '+358501234567',
      user: 'usr_alice',
      role: 'signer',
      status: 'completed',
      ordinal: 1,
      authentication_type: 'strong_auth_sweden',
      personal_id: '198001011234',
      language: 'fi',
      signed: '2025-02-01T14:20:00Z',
    }
    const result = transformSigner(raw, 'esgn_env001')

    expect(result.id).toBe('sgnr_abc')
    expect(result.externalId).toBe('sgnr_abc')
    expect(result.envelopeId).toBe('esgn_env001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    // role 'signer' → 'signer'
    expect(result.role).toBe('signer')
    // status 'completed' → 'signed'
    expect(result.status).toBe('signed')
    // ordinal 1 → routingOrder 1
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2025-02-01T14:20:00.000Z')
    expect(result.platform).toBe('zefort')
    expect(result.metadata.authenticationType).toBe('strong_auth_sweden')
    expect(result.metadata.language).toBe('fi')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to email for externalId when id is absent', () => {
    const raw: RawZefortParty = { email: 'bob@example.com', name: 'Bob' }
    const result = transformSigner(raw, 'esgn_env002')

    expect(result.id).toBe('bob@example.com')
    expect(result.externalId).toBe('bob@example.com')
    // default role 'signer', default status 'created'
    expect(result.role).toBe('signer')
    expect(result.status).toBe('created')
    // ordinal absent → routingOrder undefined
    expect(result.routingOrder).toBeUndefined()

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps role variants cc and approver', () => {
    const ccResult = transformSigner({ role: 'cc', email: 'cc@example.com' }, 'e1')
    expect(ccResult.role).toBe('cc')

    const approverResult = transformSigner({ role: 'approver', email: 'ap@example.com' }, 'e1')
    expect(approverResult.role).toBe('approver')
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string, string]> = [
      ['signed', 'signed'],
      ['declined', 'declined'],
      ['pending', 'sent'],
      ['unknown', 'created'],
    ]
    for (const [input, expected] of cases) {
      const result = transformSigner({ status: input, email: 'x@example.com' }, 'e1')
      expect(result.status).toBe(expected)
    }
  })

  it('ignores ordinal < 1 for routingOrder (only ordinal >= 1 is valid)', () => {
    const raw: RawZefortParty = { ordinal: 0, email: 'zero@example.com' }
    const result = transformSigner(raw, 'e2')
    expect(result.routingOrder).toBeUndefined()
  })
})
