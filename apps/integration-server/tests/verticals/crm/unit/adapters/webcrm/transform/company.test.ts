import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawWebcrmOrganisation } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/company'

function makeRaw(overrides: Partial<RawWebcrmOrganisation> = {}): RawWebcrmOrganisation {
  return { ...overrides }
}

describe('webcrm transformCompany', () => {
  it('maps id from OrganisationId', () => {
    expect(transformCompany(makeRaw({ OrganisationId: 1 })).id).toBe('1')
  })

  it('maps name from OrganisationName', () => {
    expect(transformCompany(makeRaw({ OrganisationName: 'Acme' })).name).toBe('Acme')
  })

  it('maps phone from OrganisationPhone', () => {
    expect(transformCompany(makeRaw({ OrganisationPhone: '+1234' })).phone).toBe('+1234')
  })

  it('maps domain from OrganisationWebsite', () => {
    expect(transformCompany(makeRaw({ OrganisationWebsite: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps industry from OrganisationIndustry', () => {
    expect(transformCompany(makeRaw({ OrganisationIndustry: 'Tech' })).industry).toBe('Tech')
  })

  it('maps owner_id from OwnedBy', () => {
    expect(transformCompany(makeRaw({ OwnedBy: 7 })).owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '+1234' })
    expect(result.OrganisationName).toBe('Acme')
    expect(result.OrganisationPhone).toBe('+1234')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ OrganisationId: 1 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
