import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type RegateContact } from '../../../../../../../src/verticals/accounting/adapters/regate/transform/contact'

function makeContact(overrides: Partial<RegateContact> = {}): RegateContact {
  return {
    id: '7',
    name: 'Dupont SA',
    registration_number: '12345678900012',
    vat_number: 'FR12345678900',
    email: 'dupont@example.fr',
    phone: '0123456789',
    address: '1 Rue de la Banque',
    postal_code: '75002',
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
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('7')
    expect(result.name).toBe('Dupont SA')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75002')
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
