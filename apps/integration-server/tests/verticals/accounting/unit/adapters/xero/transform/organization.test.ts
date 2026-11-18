import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type XeroOrganisation } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/organization'

function makeOrg(overrides: Partial<XeroOrganisation> = {}): XeroOrganisation {
  return {
    Name: 'Acme Ltd',
    LegalName: 'Acme Limited',
    TaxNumber: 'GB123456789',
    BaseCurrency: 'GBP',
    CountryCode: 'GB',
    OrganisationID: 'org-001',
    Website: 'https://acme.example.com',
    ...overrides,
  }
}

describe('transformOrganization (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Acme Ltd')
    expect(result.legalName).toBe('Acme Limited')
    expect(result.taxNumber).toBe('GB123456789')
    expect(result.currency).toBe('GBP')
    expect(result.website).toBe('https://acme.example.com')
  })

  it('maps CountryCode into address.country', () => {
    expect(transformOrganization(makeOrg()).address?.country).toBe('GB')
  })

  it('sets address to undefined when CountryCode is empty', () => {
    expect(transformOrganization(makeOrg({ CountryCode: '' })).address).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
