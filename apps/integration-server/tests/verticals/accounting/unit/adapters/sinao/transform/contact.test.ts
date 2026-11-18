import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SinaoContact } from '../../../../../../../src/verticals/accounting/adapters/sinao/transform/contact'

function makeContact(overrides: Partial<SinaoContact> = {}): SinaoContact {
  return {
    id: '5',
    name: 'Tech Corp SARL',
    siret: '98765432100019',
    vat_number: 'FR98765432100',
    email: 'info@techcorp.fr',
    phone: '0987654321',
    address: '5 Boulevard Haussmann',
    zip_code: '75009',
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
    expect(result.id).toBe('5')
    expect(result.name).toBe('Tech Corp SARL')
    expect(result.identification).toBe('98765432100019')
    expect(result.taxNumber).toBe('FR98765432100')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('5 Boulevard Haussmann')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75009')
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
