import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawActiveCampaignCompany } from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/company'

function makeRaw(overrides: Partial<RawActiveCampaignCompany> = {}): RawActiveCampaignCompany {
  return { id: '1', name: 'Acme', ...overrides }
}

describe('activecampaign transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from orgurl', () => {
    expect(transformCompany(makeRaw({ orgurl: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps canonical fields back', () => {
    const result = untransformCompany({ name: 'Test', domain: 'test.com' })
    expect(result.name).toBe('Test')
    expect(result.orgurl).toBe('test.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 99 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
