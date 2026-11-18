import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type WintOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/wint/transform/organization'

function makeOrganization(overrides: Partial<WintOrganization> = {}): WintOrganization {
  return {
    id: 1,
    name: 'Wint Test AB',
    org_nr: '556888-2222',
    vat_nr: 'SE556888222201',
    email: 'info@wint-test.se',
    phone: '+46812223344',
    address: 'Drottninggatan 20',
    city: 'Uppsala',
    zip: '753 10',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (Wint)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Wint Test AB')
    expect(result.legalName).toBe('Wint Test AB')
    expect(result.taxNumber).toBe('556888-2222')
    expect(result.currency).toBe('SEK')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Drottninggatan 20')
    expect(result.address?.city).toBe('Uppsala')
    expect(result.address?.postalCode).toBe('753 10')
    expect(result.address?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrganization({ id: 2 })
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('uses org_nr as taxNumber (not vat_nr)', () => {
    const result = transformOrganization(makeOrganization({ org_nr: '555000-1111', vat_nr: 'SE555000111101' }))
    expect(result.taxNumber).toBe('555000-1111')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
