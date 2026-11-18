import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type KashooContact,
} from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/contact'

function makeContact(overrides: Partial<KashooContact> = {}): KashooContact {
  return {
    id: 'contact-1',
    name: 'Acme Corp',
    email: 'info@acme.com',
    phone: '+1 555-123-4567',
    company_name: 'Acme Corporation',
    tax_number: '12-3456789',
    is_customer: true,
    is_supplier: false,
    billing_address: {
      line1: '123 Main St',
      line2: 'Suite 100',
      city: 'Vancouver',
      state: 'BC',
      zip: 'V6B 1A1',
      country: 'CA',
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

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corporation')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12-3456789')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformContact(makeContact({ is_customer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ is_customer: false })).isCustomer).toBe(false)
  })

  it('maps is_supplier to isSupplier', () => {
    expect(transformContact(makeContact({ is_supplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ is_supplier: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.com', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1 555-123-4567', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('Vancouver')
    expect(c.billingAddress?.region).toBe('BC')
    expect(c.billingAddress?.postalCode).toBe('V6B 1A1')
    expect(c.billingAddress?.country).toBe('CA')
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
