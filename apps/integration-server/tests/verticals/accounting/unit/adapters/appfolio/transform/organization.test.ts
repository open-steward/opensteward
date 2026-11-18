import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AppFolioOrganization } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/organization'

function makeOrganization(overrides: Partial<AppFolioOrganization> = {}): AppFolioOrganization {
  return {
    id: '1',
    company_name: 'Sunridge Property Management',
    email: 'info@sunridge.com',
    phone: '512-555-0100',
    address: '100 Congress Ave',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'US',
    tax_id: '12-3456789',
    ...overrides,
  }
}

describe('transformOrganization (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Sunridge Property Management')
    expect(result.legalName).toBe('Sunridge Property Management')
    expect(result.taxNumber).toBe('12-3456789')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('100 Congress Ave')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformOrganization(makeOrganization({
      address: '',
      city: '',
      state: '',
      zip: '',
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
