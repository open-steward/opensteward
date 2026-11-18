import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type FinlyContact,
} from '../../../../../../../src/verticals/accounting/adapters/finly/transform/contact'

function makeContact(overrides: Partial<FinlyContact> = {}): FinlyContact {
  return {
    id: 'vendor-1',
    name: 'Acme Supplies',
    email: 'billing@acme.com',
    phone: '+1 555-9876',
    company: 'Acme Supplies Inc.',
    tax_number: 'US98765432',
    address: {
      street: '456 Oak Ave',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      country: 'US',
    },
    is_active: true,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('vendor-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Supplies')
  })

  it('maps company to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Supplies Inc.')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('US98765432')
  })

  it('sets isCustomer to false (vendor-focused)', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(false)
  })

  it('sets isSupplier to true (vendor-focused)', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(true)
  })

  it('maps is_active to isActive', () => {
    expect(transformContact(makeContact({ is_active: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ is_active: false })).isActive).toBe(false)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'billing@acme.com', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1 555-9876', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('456 Oak Ave')
    expect(c.billingAddress?.city).toBe('Chicago')
    expect(c.billingAddress?.region).toBe('IL')
    expect(c.billingAddress?.postalCode).toBe('60601')
    expect(c.billingAddress?.country).toBe('US')
  })

  it('returns undefined billingAddress when address is null', () => {
    expect(transformContact(makeContact({ address: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('returns undefined companyName when company is empty', () => {
    expect(transformContact(makeContact({ company: '' })).companyName).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
