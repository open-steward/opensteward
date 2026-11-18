import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawTeamwaveOrganization } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/company'

function makeRaw(overrides: Partial<RawTeamwaveOrganization> = {}): RawTeamwaveOrganization {
  return { id: 10, name: 'Teamwave Co', ...overrides }
}

describe('teamwave transformCompany', () => {
  it('maps id and name', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('10')
    expect(result.name).toBe('Teamwave Co')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://tw.com' })).domain).toBe('https://tw.com')
  })

  it('maps industry field', () => {
    expect(transformCompany(makeRaw({ industry: 'Tech' })).industry).toBe('Tech')
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

describe('teamwave untransformCompany', () => {
  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'tw.com' }).website).toBe('tw.com')
  })
})
