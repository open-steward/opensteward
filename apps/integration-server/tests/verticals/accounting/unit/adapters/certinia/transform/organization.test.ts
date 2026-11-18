import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type CertiniaOrganization } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/organization'

function makeOrganization(overrides: Partial<CertiniaOrganization> = {}): CertiniaOrganization {
  return {
    Id: 'ORG000000001',
    Name: 'Certinia Inc',
    TaxId__c: '94-1234567',
    BillingStreet: '2 King Street',
    BillingCity: 'San Francisco',
    BillingState: 'CA',
    BillingPostalCode: '94105',
    BillingCountry: 'US',
    Phone: '+1-415-555-0200',
    Email__c: 'info@certinia.com',
    ...overrides,
  }
}

describe('transformOrganization (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Certinia Inc')
    expect(result.legalName).toBe('Certinia Inc')
    expect(result.taxNumber).toBe('94-1234567')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('maps billing address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('2 King Street')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformOrganization(makeOrganization({
      BillingStreet: '',
      BillingCity: '',
      BillingState: '',
      BillingPostalCode: '',
      BillingCountry: '',
    }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
