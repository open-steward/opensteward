import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FocusSoftnetContact } from '../../../../../../../src/verticals/accounting/adapters/focussoftnet/transform/contact'

function makeRaw(overrides: Partial<FocusSoftnetContact> = {}): FocusSoftnetContact {
  return {
    AccCode: 'CUST001',
    AccName: 'Dubai Tech Solutions',
    Email: 'info@dubaitech.ae',
    Phone: '+97142223333',
    Address: '7 Sheikh Zayed Rd, Dubai',
    TaxRegNo: 'TRN100200300',
    IsCustomer: true,
    IsSupplier: false,
    ...overrides,
  }
}

describe('transformContact (focussoftnet)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CUST001')
    expect(result.name).toBe('Dubai Tech Solutions')
    expect(result.taxNumber).toBe('TRN100200300')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps IsCustomer=true to isCustomer=true', () => {
    const result = transformContact(makeRaw({ IsCustomer: true, IsSupplier: false }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps IsSupplier=true to isSupplier=true', () => {
    const result = transformContact(makeRaw({ IsCustomer: false, IsSupplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('handles both IsCustomer and IsSupplier as true', () => {
    const result = transformContact(makeRaw({ IsCustomer: true, IsSupplier: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps Email into emails array', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('info@dubaitech.ae')
  })

  it('maps Phone into telephones array with WORK type', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+97142223333')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address from Address field', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress).toBeDefined()
  })

  it('returns no telephones when Phone is empty', () => {
    const result = transformContact(makeRaw({ Phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
