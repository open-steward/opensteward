import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ErpNextContact } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/contact'

function makeRaw(overrides: Partial<ErpNextContact> = {}): ErpNextContact {
  return {
    name: 'CONT-001',
    full_name: 'John Doe',
    email_id: 'john@acme.com',
    mobile_no: '+1-555-1234',
    address_line1: '123 Main St',
    city: 'Austin',
    country: 'United States',
    customer_name: 'ACME Corp',
    supplier_name: '',
    ...overrides,
  }
}

describe('transformContact (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CONT-001')
    expect(result.name).toBe('John Doe')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps supplier flag', () => {
    const result = transformContact(makeRaw({ customer_name: '', supplier_name: 'Supplier Ltd' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps emails', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('john@acme.com')
  })

  it('maps address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Austin')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
