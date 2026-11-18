import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DatevOrganization } from '../../../../../../../src/verticals/accounting/adapters/datev/transform/organization'

function makeOrganization(overrides: Partial<DatevOrganization> = {}): DatevOrganization {
  return {
    id: 'org-1',
    name: 'Muster AG',
    legal_name: 'Muster Aktiengesellschaft',
    tax_number: 'DE123456789',
    street: 'Musterstraße 1',
    zip_code: '80331',
    city: 'München',
    country_code: 'DE',
    currency_code: 'EUR',
    email: 'info@muster.de',
    phone: '+49 89 123456',
    ...overrides,
  }
}

describe('transformOrganization (DATEV)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Muster AG')
    expect(result.legalName).toBe('Muster Aktiengesellschaft')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
  })

  it('maps address fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Musterstraße 1')
    expect(result.address?.postalCode).toBe('80331')
    expect(result.address?.city).toBe('München')
    expect(result.address?.country).toBe('DE')
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
