import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MazeedOneCompany } from '../../../../../../../src/verticals/accounting/adapters/mazeedone/transform/organization'

function makeRaw(overrides: Partial<MazeedOneCompany> = {}): MazeedOneCompany {
  return {
    id: 'COMP-001',
    name: 'MazeedOne Technologies',
    email: 'info@mazeedone.sa',
    phone: '+966126000000',
    address: 'Tahlia Street, Jeddah, Saudi Arabia',
    vat_number: 'VAT310000000000099',
    currency: 'SAR',
    ...overrides,
  }
}

describe('transformOrganization (mazeedone)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('MazeedOne Technologies')
    expect(result.legalName).toBe('MazeedOne Technologies')
    expect(result.taxNumber).toBe('VAT310000000000099')
    expect(result.currency).toBe('SAR')
  })

  it('sets name and legalName to the same value', () => {
    const result = transformOrganization(makeRaw({ name: 'Other Company' }))
    expect(result.name).toBe('Other Company')
    expect(result.legalName).toBe('Other Company')
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

  it('omits taxNumber when vat_number is empty', () => {
    const result = transformOrganization(makeRaw({ vat_number: '' }))
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
