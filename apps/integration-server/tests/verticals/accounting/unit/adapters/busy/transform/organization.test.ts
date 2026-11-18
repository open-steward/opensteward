import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BusyOrganization } from '../../../../../../../src/verticals/accounting/adapters/busy/transform/organization'

function makeRaw(overrides: Partial<BusyOrganization> = {}): BusyOrganization {
  return {
    CompanyCode: 'COMP-001',
    CompanyName: 'Acme Trading LLC',
    Email: 'admin@acme.com',
    Mobile: '+97142345678',
    Address: 'PO Box 1234, Dubai, UAE',
    GSTNo: 'TRN100234567890',
    Currency: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (busy)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('COMP-001')
    expect(result.name).toBe('Acme Trading LLC')
    expect(result.legalName).toBe('Acme Trading LLC')
    expect(result.taxNumber).toBe('TRN100234567890')
    expect(result.currency).toBe('AED')
  })

  it('sets name and legalName to the same value', () => {
    const result = transformOrganization(makeRaw({ CompanyName: 'My Company' }))
    expect(result.name).toBe('My Company')
    expect(result.legalName).toBe('My Company')
  })

  it('maps address from Address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxNumber when GSTNo is empty', () => {
    const result = transformOrganization(makeRaw({ GSTNo: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('omits currency when Currency is empty', () => {
    const result = transformOrganization(makeRaw({ Currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('omits name when CompanyName is empty', () => {
    const result = transformOrganization(makeRaw({ CompanyName: '' }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
