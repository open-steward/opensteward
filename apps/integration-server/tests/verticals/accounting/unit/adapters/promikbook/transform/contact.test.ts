import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PromikBookContact,
} from '../../../../../../../src/verticals/accounting/adapters/promikbook/transform/contact'

function makeContact(overrides: Partial<PromikBookContact> = {}): PromikBookContact {
  return {
    id: 55,
    name: 'Nordic Consulting AB',
    email: 'info@nordic.se',
    phone: '+46701234567',
    address: 'Storgatan 5',
    city: 'Malmö',
    zip: '211 22',
    country: 'SE',
    org_number: '556789-0123',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (PromikBook)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('55')
    expect(result.name).toBe('Nordic Consulting AB')
    expect(result.identification).toBe('556789-0123')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@nordic.se')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Storgatan 5')
    expect(result.billingAddress?.city).toBe('Malmö')
    expect(result.billingAddress?.postalCode).toBe('211 22')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('defaults isCustomer to true and isSupplier to false when not provided', () => {
    const raw = makeContact()
    delete (raw as Partial<PromikBookContact>).is_customer
    delete (raw as Partial<PromikBookContact>).is_supplier
    const result = transformContact(raw)
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
