import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawDynamicsAccount } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/company'

function makeRaw(overrides: Partial<RawDynamicsAccount> = {}): RawDynamicsAccount {
  return { accountid: 'a1', name: 'Acme', ...overrides }
}

describe('dynamics365-crm transformCompany', () => {
  it('maps accountid to id', () => {
    expect(transformCompany(makeRaw()).id).toBe('a1')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from websiteurl', () => {
    expect(transformCompany(makeRaw({ websiteurl: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps name and websiteurl', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'corp.com' })
    expect(result.name).toBe('Corp')
    expect(result.websiteurl).toBe('corp.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
