import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type ClearContact,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/contact'

function makeRaw(overrides: Partial<ClearContact> = {}): ClearContact {
  return {
    id: 'contact-uuid-001',
    name: 'Acme Pvt Ltd',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    email: 'billing@acme.in',
    phone: '+919876543210',
    billing_address_line1: '123 MG Road',
    billing_address_line2: 'Floor 4',
    billing_city: 'Bengaluru',
    billing_state: 'Karnataka',
    billing_pincode: '560001',
    billing_country: 'IN',
    shipping_address_line1: '456 Indiranagar',
    shipping_city: 'Bengaluru',
    shipping_state: 'Karnataka',
    shipping_pincode: '560038',
    shipping_country: 'IN',
    is_customer: true,
    is_supplier: false,
    currency: 'INR',
    is_active: true,
    ...overrides,
  }
}

describe('transformContact (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('contact-uuid-001')
    expect(result.name).toBe('Acme Pvt Ltd')
    expect(result.taxNumber).toBe('29ABCDE1234F1Z5')
    expect(result.identification).toBe('ABCDE1234F')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('INR')
  })

  it('maps email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('billing@acme.in')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+919876543210')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address with state as region', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 MG Road')
    expect(result.billingAddress?.city).toBe('Bengaluru')
    expect(result.billingAddress?.region).toBe('Karnataka')
    expect(result.billingAddress?.postalCode).toBe('560001')
    expect(result.billingAddress?.country).toBe('IN')
  })

  it('maps shipping address', () => {
    const result = transformContact(makeRaw())
    expect(result.shippingAddress?.address1).toBe('456 Indiranagar')
    expect(result.shippingAddress?.city).toBe('Bengaluru')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
