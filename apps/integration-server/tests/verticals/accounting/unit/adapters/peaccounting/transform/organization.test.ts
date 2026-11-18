import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PEAccountingOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/peaccounting/transform/organization'

function makeOrganization(overrides: Partial<PEAccountingOrganization> = {}): PEAccountingOrganization {
  return {
    id: 1,
    name: 'Acme Sverige AB',
    org_number: '556123-4567',
    vat_number: 'SE556123456701',
    email: 'info@acme.se',
    phone: '+46 8 123 456',
    address: 'Kungsgatan 10',
    city: 'Stockholm',
    zip: '111 43',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (PE Accounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme Sverige AB')
    expect(result.legalName).toBe('Acme Sverige AB')
    expect(result.taxNumber).toBe('556123-4567')
    expect(result.currency).toBe('SEK')
  })

  it('falls back to vat_number when org_number is missing', () => {
    const raw = makeOrganization({ org_number: undefined })
    const result = transformOrganization(raw)
    expect(result.taxNumber).toBe('SE556123456701')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Kungsgatan 10')
    expect(result.address?.city).toBe('Stockholm')
    expect(result.address?.postalCode).toBe('111 43')
    expect(result.address?.country).toBe('SE')
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
