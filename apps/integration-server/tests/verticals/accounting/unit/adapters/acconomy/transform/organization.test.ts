import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type AcconomyOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/acconomy/transform/organization'

function makeOrganization(overrides: Partial<AcconomyOrganization> = {}): AcconomyOrganization {
  return {
    id: 10,
    name: 'Beta GmbH',
    org_nr: 'HRB 12345',
    vat_nr: 'DE123456789',
    email: 'contact@beta.de',
    phone: '+49 30 123456',
    address: 'Berliner Str. 5',
    city: 'Berlin',
    postal_code: '10115',
    country: 'DE',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (Acconomy)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Beta GmbH')
    expect(result.legalName).toBe('Beta GmbH')
    expect(result.taxNumber).toBe('HRB 12345')
    expect(result.currency).toBe('EUR')
  })

  it('falls back to vat_nr when org_nr is missing', () => {
    const raw = makeOrganization({ org_nr: undefined })
    const result = transformOrganization(raw)
    expect(result.taxNumber).toBe('DE123456789')
  })

  it('maps address fields using postal_code', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Berliner Str. 5')
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.postalCode).toBe('10115')
    expect(result.address?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrganization({})
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
