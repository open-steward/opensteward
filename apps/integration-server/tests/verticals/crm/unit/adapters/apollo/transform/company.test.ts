import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawApolloAccount } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/company'

function makeRaw(overrides: Partial<RawApolloAccount> = {}): RawApolloAccount {
  return { id: 'a1', name: 'Acme', ...overrides }
}

describe('apollo transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('a1')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain', () => {
    expect(transformCompany(makeRaw({ domain: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps fields back', () => {
    const result = untransformCompany({ name: 'Corp', phone: '123' })
    expect(result.name).toBe('Corp')
    expect(result.phone).toBe('123')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
