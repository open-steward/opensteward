import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FocusSoftnetOrganization } from '../../../../../../../src/verticals/accounting/adapters/focussoftnet/transform/organization'

function makeRaw(overrides: Partial<FocusSoftnetOrganization> = {}): FocusSoftnetOrganization {
  return {
    CompCode: 'COMP001',
    CompName: 'Emirates Tech FZE',
    Email: 'admin@emiratestech.ae',
    Phone: '+97142000000',
    Address: '1 Free Zone Area, Dubai',
    TaxRegNo: 'TRN777888999',
    CurrCode: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (focussoftnet)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('COMP001')
    expect(result.name).toBe('Emirates Tech FZE')
    expect(result.legalName).toBe('Emirates Tech FZE')
    expect(result.taxNumber).toBe('TRN777888999')
    expect(result.currency).toBe('AED')
  })

  it('uses CompCode as id', () => {
    const result = transformOrganization(makeRaw({ CompCode: 'X001' }))
    expect(result.id).toBe('X001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets legalName equal to CompName', () => {
    const result = transformOrganization(makeRaw({ CompName: 'New Corp' }))
    expect(result.name).toBe('New Corp')
    expect(result.legalName).toBe('New Corp')
  })

  it('maps address from Address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('maps CurrCode to currency', () => {
    const result = transformOrganization(makeRaw({ CurrCode: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('maps TaxRegNo to taxNumber', () => {
    const result = transformOrganization(makeRaw({ TaxRegNo: 'TRN000111222' }))
    expect(result.taxNumber).toBe('TRN000111222')
  })

  it('handles empty Address gracefully', () => {
    const result = transformOrganization(makeRaw({ Address: '' }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
