import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type ProfitBooksContact,
} from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/contact'

function makeContact(overrides: Partial<ProfitBooksContact> = {}): ProfitBooksContact {
  return {
    id: 'contact-1',
    name: 'Acme Corp',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@acme.com',
    phone: '+1 555-1234',
    company_name: 'Acme Corporation',
    tax_number: 'US123456789',
    is_customer: true,
    is_supplier: false,
    is_active: true,
    billing_address: {
      address1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps first_name to firstName', () => {
    expect(transformContact(makeContact()).firstName).toBe('John')
  })

  it('maps last_name to lastName', () => {
    expect(transformContact(makeContact()).lastName).toBe('Doe')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corporation')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('US123456789')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformContact(makeContact({ is_customer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ is_customer: false })).isCustomer).toBe(false)
  })

  it('maps is_supplier to isSupplier', () => {
    expect(transformContact(makeContact({ is_supplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ is_supplier: false })).isSupplier).toBe(false)
  })

  it('maps is_active to isActive', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'john@acme.com', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1 555-1234', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('New York')
    expect(c.billingAddress?.region).toBe('NY')
    expect(c.billingAddress?.postalCode).toBe('10001')
    expect(c.billingAddress?.country).toBe('US')
  })

  it('returns undefined billingAddress when billing_address is null', () => {
    expect(transformContact(makeContact({ billing_address: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
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
