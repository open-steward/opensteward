import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type VismaCompanySettings } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/organization'

function makeCompanySettings(overrides: Partial<VismaCompanySettings> = {}): VismaCompanySettings {
  return {
    Name: 'Test Company AB',
    CorporateIdentityNumber: '556677-8899',
    Email: 'info@testcompany.se',
    Phone: '08-123456',
    MobilePhone: '070-1234567',
    Address1: 'Kungsgatan 10',
    Address2: 'Floor 3',
    City: 'Stockholm',
    PostalCode: '11143',
    CountryCode: 'SE',
    CurrencyCode: 'SEK',
    Website: 'https://testcompany.se',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps company name', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(result.name).toBe('Test Company AB')
    expect(result.legalName).toBe('Test Company AB')
  })

  it('maps tax number from corporate identity number', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(result.taxNumber).toBe('556677-8899')
  })

  it('maps currency', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(result.currency).toBe('SEK')
  })

  it('maps website', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(result.website).toBe('https://testcompany.se')
  })

  it('maps address', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(result.address).toEqual({
      address1: 'Kungsgatan 10',
      address2: 'Floor 3',
      city: 'Stockholm',
      postalCode: '11143',
      country: 'SE',
    })
  })

  it('passes raw object through as metadata', () => {
    const raw = makeCompanySettings()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompanySettings())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
