import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BrioxOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/briox/transform/organization'

function makeOrganization(overrides: Partial<BrioxOrganization> = {}): BrioxOrganization {
  return {
    id: 1,
    name: 'Briox Test AB',
    org_number: '556999-1234',
    vat_number: 'SE556999123401',
    email: 'contact@briox-test.se',
    phone: '+46812345678',
    address: 'Kungsgatan 10',
    city: 'Gothenburg',
    zip: '411 19',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (Briox)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Briox Test AB')
    expect(result.legalName).toBe('Briox Test AB')
    expect(result.taxNumber).toBe('556999-1234')
    expect(result.currency).toBe('SEK')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Kungsgatan 10')
    expect(result.address?.city).toBe('Gothenburg')
    expect(result.address?.postalCode).toBe('411 19')
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

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
