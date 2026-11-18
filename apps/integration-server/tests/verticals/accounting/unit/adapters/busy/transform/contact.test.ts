import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BusyContact } from '../../../../../../../src/verticals/accounting/adapters/busy/transform/contact'

function makeRaw(overrides: Partial<BusyContact> = {}): BusyContact {
  return {
    AccCode: 'ACC001',
    AccName: 'Acme Corp',
    Email: 'info@acme.com',
    Mobile: '+971501234567',
    Address: '123 Sheikh Zayed Road, Dubai',
    GSTNo: 'GST123456',
    IsCustomer: true,
    IsSupplier: false,
    ...overrides,
  }
}

describe('transformContact (busy)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('ACC001')
    expect(result.name).toBe('Acme Corp')
    expect(result.taxNumber).toBe('GST123456')
  })

  it('maps isCustomer and isSupplier flags', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps supplier with isSupplier true', () => {
    const result = transformContact(makeRaw({ IsCustomer: false, IsSupplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps both customer and supplier flags when both true', () => {
    const result = transformContact(makeRaw({ IsCustomer: true, IsSupplier: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('info@acme.com')
  })

  it('maps mobile to telephones array', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+971501234567')
    expect(result.telephones![0].type).toBe('MOBILE')
  })

  it('returns undefined telephones when Mobile is empty', () => {
    const result = transformContact(makeRaw({ Mobile: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billingAddress from Address field', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxNumber when GSTNo is empty', () => {
    const result = transformContact(makeRaw({ GSTNo: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('omits name when AccName is empty', () => {
    const result = transformContact(makeRaw({ AccName: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
