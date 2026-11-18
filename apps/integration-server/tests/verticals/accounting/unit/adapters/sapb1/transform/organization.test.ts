import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SapB1Company,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/organization'

function makeOrganization(overrides: Partial<SapB1Company> = {}): SapB1Company {
  return {
    CompanyName: 'Acme Corp',
    CompanyNameForeign: 'Acme Corporation',
    TaxOffice: 'TX-99999',
    BasicCurrency: 'USD',
    Street: '456 Elm Ave',
    City: 'Metropolis',
    ZipCode: '10001',
    Country: 'US',
    Phone1: '+1-555-0200',
    Email: 'contact@acme.com',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corp')
  })

  it('maps CompanyName to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Corp')
  })

  it('maps TaxOffice to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('TX-99999')
  })

  it('maps BasicCurrency to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps address fields correctly', () => {
    expect(transformOrganization(makeOrganization()).address).toEqual({
      address1: '456 Elm Ave',
      city: 'Metropolis',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
