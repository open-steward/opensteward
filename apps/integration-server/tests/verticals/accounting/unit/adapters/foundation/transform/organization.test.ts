import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FoundationOrganization } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/organization'

function makeOrganization(overrides: Partial<FoundationOrganization> = {}): FoundationOrganization {
  return {
    CompanyId: 'COMP-1',
    CompanyName: 'Foundation Corp',
    TaxId: '12-3456789',
    Address1: '100 Builder Way',
    Address2: '',
    City: 'Denver',
    State: 'CO',
    ZipCode: '80202',
    Country: 'US',
    Phone: '303-555-0100',
    Email: 'info@foundation.com',
    ...overrides,
  }
}

describe('transformOrganization (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Foundation Corp')
    expect(result.legalName).toBe('Foundation Corp')
    expect(result.taxNumber).toBe('12-3456789')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('100 Builder Way')
    expect(result.address?.city).toBe('Denver')
    expect(result.address?.region).toBe('CO')
    expect(result.address?.postalCode).toBe('80202')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformOrganization(makeOrganization({
      Address1: '',
      Address2: '',
      City: '',
      State: '',
      ZipCode: '',
      Country: '',
    }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
