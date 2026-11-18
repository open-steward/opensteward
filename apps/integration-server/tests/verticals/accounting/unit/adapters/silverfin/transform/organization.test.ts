import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SilverfinOrganization } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/organization'

function makeOrganization(overrides: Partial<SilverfinOrganization> = {}): SilverfinOrganization {
  return {
    id: '1',
    name: 'Silverfin Demo Company',
    company_number: 'BE0987654321',
    vat_number: 'BE0987654321',
    email: 'admin@demo.com',
    phone: '+32 3 456 78 90',
    address: 'Antwerpsesteenweg 50',
    city: 'Ghent',
    postal_code: '9000',
    country: 'BE',
    ...overrides,
  }
}

describe('transformOrganization (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Silverfin Demo Company')
    expect(result.legalName).toBe('Silverfin Demo Company')
    expect(result.taxNumber).toBe('BE0987654321')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Antwerpsesteenweg 50')
    expect(result.address?.city).toBe('Ghent')
    expect(result.address?.postalCode).toBe('9000')
    expect(result.address?.country).toBe('BE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
