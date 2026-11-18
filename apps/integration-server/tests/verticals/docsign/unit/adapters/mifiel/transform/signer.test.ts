import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/mifiel/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { STAKEHOLDER_EXAMPLE } from './fixtures'

describe('mifiel transformSigner', () => {
  it('maps the documented stakeholder onto the canonical schema', () => {
    const out = SignerSchema.parse(transformSigner(STAKEHOLDER_EXAMPLE, 'doc-1'))
    expect(out.id).toBe(STAKEHOLDER_EXAMPLE.id)
    expect(out.externalId).toBe(STAKEHOLDER_EXAMPLE.id)
    expect(out.envelopeId).toBe('doc-1')
    expect(out.email).toBe('victor@mifiel.com')
    expect(out.name).toBe('Sergio Montoya')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('sent')
    expect(out.metadata).toEqual({ type: 'Signer', state: 'pending' })
    expect(out.platform).toBe('mifiel')
  })

  it.each([
    ['pending', 'sent'],
    ['completed', 'signed'],
    ['rejected', 'unknown'],
  ])('maps state %s to %s', (state, expected) => {
    expect(SignerSchema.parse(transformSigner({ ...STAKEHOLDER_EXAMPLE, state }, 'd')).status).toBe(
      expected,
    )
  })

  it('a stakeholder without an id or a name is an error, not a placeholder', () => {
    expect(() => transformSigner({ ...STAKEHOLDER_EXAMPLE, id: undefined }, 'd')).toThrow(/no id/)
    expect(() => transformSigner({ ...STAKEHOLDER_EXAMPLE, name: null }, 'd')).toThrow(/no name/)
  })

  it('an absent email stays absent', () => {
    const out = SignerSchema.parse(transformSigner({ ...STAKEHOLDER_EXAMPLE, email: null }, 'd'))
    expect(out.email).toBeUndefined()
  })
})
