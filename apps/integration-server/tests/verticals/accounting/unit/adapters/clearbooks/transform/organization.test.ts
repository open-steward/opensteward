import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ClearBooksOrganization } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/organization'

function makeOrganization(overrides: Partial<ClearBooksOrganization> = {}): ClearBooksOrganization {
  return {
    company_name: 'Acme Trading Ltd',
    vat_number: 'GB123456789',
    company_number: '01234567',
    email: 'info@acme.co.uk',
    phone: '020 7946 0100',
    address_1: '1 Business Park',
    address_2: 'Industrial Estate',
    town: 'Manchester',
    county: 'Greater Manchester',
    postcode: 'M1 1AA',
    country: 'GB',
    ...overrides,
  }
}

describe('transformOrganization (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme Trading Ltd')
    expect(result.legalName).toBe('Acme Trading Ltd')
    expect(result.taxNumber).toBe('GB123456789')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('1 Business Park')
    expect(result.address?.city).toBe('Manchester')
    expect(result.address?.postalCode).toBe('M1 1AA')
    expect(result.address?.country).toBe('GB')
    expect(result.address?.region).toBe('Greater Manchester')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformOrganization(makeOrganization({
      address_1: '',
      address_2: '',
      town: '',
      county: '',
      postcode: '',
      country: '',
    }))
    expect(result.address).toBeUndefined()
  })

  it('handles missing company_name gracefully', () => {
    const result = transformOrganization(makeOrganization({ company_name: '' }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
