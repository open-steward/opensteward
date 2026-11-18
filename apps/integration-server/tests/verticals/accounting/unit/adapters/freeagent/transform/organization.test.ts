import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FreeAgentCompany,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/organization'

function makeCompany(overrides: Partial<FreeAgentCompany> = {}): FreeAgentCompany {
  return {
    url: 'https://api.freeagent.com/v2/company',
    name: 'Acme Ltd',
    subdomain: 'acme',
    type: 'LimitedCompany',
    currency: 'GBP',
    registration_number: '12345678',
    sales_tax_registration_number: 'GB123456789',
    address1: '10 High Street',
    address2: 'Suite 100',
    address3: '',
    town: 'London',
    region: 'England',
    postcode: 'EC1A 1BB',
    country: 'United Kingdom',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name correctly', () => {
    expect(transformOrganization(makeCompany()).name).toBe('Acme Ltd')
  })

  it('maps registration_number to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('12345678')
  })

  it('maps currency correctly', () => {
    expect(transformOrganization(makeCompany()).currency).toBe('GBP')
  })

  it('maps address fields', () => {
    const org = transformOrganization(makeCompany())
    expect(org.address?.address1).toBe('10 High Street')
    expect(org.address?.address2).toBe('Suite 100')
    expect(org.address?.city).toBe('London')
    expect(org.address?.postalCode).toBe('EC1A 1BB')
    expect(org.address?.country).toBe('GB')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
