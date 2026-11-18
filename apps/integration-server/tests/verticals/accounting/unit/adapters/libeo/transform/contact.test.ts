import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type LibeoContact } from '../../../../../../../src/verticals/accounting/adapters/libeo/transform/contact'

function makeContact(overrides: Partial<LibeoContact> = {}): LibeoContact {
  return {
    id: '3',
    name: 'Société Dupont',
    registration_number: '12345678900012',
    vat_number: 'FR12345678900',
    email: 'dupont@example.fr',
    phone: '0123456789',
    address_line1: '15 Rue Lafayette',
    postal_code: '75010',
    city: 'Paris',
    country: 'FR',
    is_customer: true,
    is_supplier: false,
    is_active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('3')
    expect(result.name).toBe('Société Dupont')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('15 Rue Lafayette')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75010')
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
