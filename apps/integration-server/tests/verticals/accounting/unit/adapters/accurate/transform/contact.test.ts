import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AccurateContact } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/contact'

function makeContact(overrides: Partial<AccurateContact> = {}): AccurateContact {
  return {
    id: 20,
    name: 'PT Sumber Makmur',
    customerNo: 'C-020',
    type: 'CUSTOMER',
    email: 'info@sumbermakmur.co.id',
    mobilePhone: '+62812-3456-7890',
    address: 'Jl. Hayam Wuruk No. 5',
    city: 'Surabaya',
    ...overrides,
  }
}

describe('transformContact (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('20')
    expect(result.name).toBe('PT Sumber Makmur')
    expect(result.identification).toBe('C-020')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@sumbermakmur.co.id')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps mobilePhone correctly', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+62812-3456-7890')
    expect(result.telephones![0].type).toBe('MOBILE')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Jl. Hayam Wuruk No. 5')
    expect(result.billingAddress?.city).toBe('Surabaya')
  })

  it('marks SUPPLIER type correctly', () => {
    const result = transformContact(makeContact({ type: 'SUPPLIER' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined emails when email is null', () => {
    const result = transformContact(makeContact({ email: null }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when mobilePhone is null', () => {
    const result = transformContact(makeContact({ mobilePhone: null }))
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
