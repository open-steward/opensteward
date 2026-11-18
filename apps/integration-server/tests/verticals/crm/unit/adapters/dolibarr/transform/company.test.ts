import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawDolibarrThirdParty } from '../../../../../../../src/verticals/crm/adapters/dolibarr/transform/company'

function makeRaw(overrides: Partial<RawDolibarrThirdParty> = {}): RawDolibarrThirdParty {
  return { id: '1', name: 'Acme', ...overrides }
}

describe('dolibarr transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from url', () => {
    expect(transformCompany(makeRaw({ url: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps name and url', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'corp.com' })
    expect(result.name).toBe('Corp')
    expect(result.url).toBe('corp.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 5 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
