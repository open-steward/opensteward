import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CloudMeContact } from '../../../../../../../src/verticals/accounting/adapters/cloudme/transform/contact'

function makeRaw(overrides: Partial<CloudMeContact> = {}): CloudMeContact {
  return {
    id: 'CONT-001',
    name: 'Riyadh Holdings',
    email: 'info@riyadhholdings.sa',
    phone: '+966112345678',
    billing_address: {
      street: 'King Fahd Road',
      city: 'Riyadh',
      postal_code: '11564',
      country: 'SA',
    },
    tax_id: 'VAT310000000000003',
    is_customer: true,
    is_vendor: false,
    ...overrides,
  }
}

describe('transformContact (cloudme)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CONT-001')
    expect(result.name).toBe('Riyadh Holdings')
    expect(result.identification).toBe('VAT310000000000003')
  })

  it('maps isCustomer and isSupplier from is_customer and is_vendor', () => {
    const result = transformContact(makeRaw())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps vendor contact correctly', () => {
    const result = transformContact(makeRaw({ is_customer: false, is_vendor: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps both flags when both are true', () => {
    const result = transformContact(makeRaw({ is_customer: true, is_vendor: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('info@riyadhholdings.sa')
  })

  it('maps phone to telephones array', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+966112345678')
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeRaw({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps structured billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress).toBeDefined()
  })

  it('returns undefined billingAddress when billing_address is null', () => {
    const result = transformContact(makeRaw({ billing_address: null }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits identification when tax_id is empty', () => {
    const result = transformContact(makeRaw({ tax_id: '' }))
    expect(result.identification).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformContact(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('handles numeric id correctly', () => {
    const result = transformContact(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
