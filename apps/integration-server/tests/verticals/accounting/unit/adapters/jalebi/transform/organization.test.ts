import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type JalebiRestaurant } from '../../../../../../../src/verticals/accounting/adapters/jalebi/transform/organization'

function makeRaw(overrides: Partial<JalebiRestaurant> = {}): JalebiRestaurant {
  return {
    id: 'REST-001',
    name: 'Jalebi Kitchen',
    email: 'info@jalebi.kitchen',
    phone: '+97150000001',
    address: 'JBR Walk, Dubai Marina, UAE',
    tax_registration: 'TRN100000000099',
    currency: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (jalebi)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('Jalebi Kitchen')
    expect(result.legalName).toBe('Jalebi Kitchen')
    expect(result.taxNumber).toBe('TRN100000000099')
    expect(result.currency).toBe('AED')
  })

  it('sets name and legalName to the same value', () => {
    const result = transformOrganization(makeRaw({ name: 'New Kitchen Name' }))
    expect(result.name).toBe('New Kitchen Name')
    expect(result.legalName).toBe('New Kitchen Name')
  })

  it('maps address from address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxNumber when tax_registration is empty', () => {
    const result = transformOrganization(makeRaw({ tax_registration: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('omits currency when currency is empty', () => {
    const result = transformOrganization(makeRaw({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformOrganization(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
