import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawZendeskSellCompany } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/company'

function makeRaw(overrides: Partial<RawZendeskSellCompany> = {}): RawZendeskSellCompany {
  return { id: 2, name: 'ZD Corp', is_organization: true, ...overrides }
}

describe('zendesk-sell transformCompany', () => {
  it('maps id and name', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('2')
    expect(result.name).toBe('ZD Corp')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://zd.com' })).domain).toBe('https://zd.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('zendesk-sell untransformCompany', () => {
  it('always sets is_organization to true', () => {
    expect(untransformCompany({}).is_organization).toBe(true)
  })

  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'zd.com' }).website).toBe('zd.com')
  })
})
