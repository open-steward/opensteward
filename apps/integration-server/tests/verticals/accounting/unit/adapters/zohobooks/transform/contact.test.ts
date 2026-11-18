import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type ZohoBooksContact,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/contact'

function makeContact(overrides: Partial<ZohoBooksContact> = {}): ZohoBooksContact {
  return {
    contact_id: 'con-001',
    contact_name: 'Jane Smith',
    company_name: 'Smith Enterprises',
    contact_type: 'customer',
    status: 'active',
    email: 'jane@smithenterprises.com',
    phone: '+1-555-0100',
    mobile: '+1-555-0101',
    currency_code: 'USD',
    billing_address: {
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps contact_id to id', () => {
    expect(transformContact(makeContact()).id).toBe('con-001')
  })

  it('maps contact_name to name', () => {
    expect(transformContact(makeContact()).name).toBe('Jane Smith')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Smith Enterprises')
  })

  it('maps currency_code to currency', () => {
    expect(transformContact(makeContact()).currency).toBe('USD')
  })

  it('maps contact_type customer to isCustomer true', () => {
    expect(transformContact(makeContact({ contact_type: 'customer' })).isCustomer).toBe(true)
  })

  it('maps contact_type customer to isSupplier false', () => {
    expect(transformContact(makeContact({ contact_type: 'customer' })).isSupplier).toBe(false)
  })

  it('maps contact_type vendor to isSupplier true', () => {
    expect(transformContact(makeContact({ contact_type: 'vendor' })).isSupplier).toBe(true)
  })

  it('maps contact_type vendor to isCustomer false', () => {
    expect(transformContact(makeContact({ contact_type: 'vendor' })).isCustomer).toBe(false)
  })

  it('maps status active to isActive true', () => {
    expect(transformContact(makeContact({ status: 'active' })).isActive).toBe(true)
  })

  it('maps status inactive to isActive false', () => {
    expect(transformContact(makeContact({ status: 'inactive' })).isActive).toBe(false)
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@smithenterprises.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephones with WORK type', () => {
    const result = transformContact(makeContact())
    const workPhone = result.telephones?.find((t) => t.type === 'WORK')
    expect(workPhone?.telephone).toBe('+1-555-0100')
  })

  it('maps mobile to telephones with MOBILE type', () => {
    const result = transformContact(makeContact())
    const mobile = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobile?.telephone).toBe('+1-555-0101')
  })

  it('maps billing_address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.postalCode).toBe('62701')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('sets emails to undefined when email is absent', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
