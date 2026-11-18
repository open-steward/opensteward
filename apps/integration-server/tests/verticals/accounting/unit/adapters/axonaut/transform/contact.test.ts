import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AxonautContact } from '../../../../../../../src/verticals/accounting/adapters/axonaut/transform/contact'

function makeContact(overrides: Partial<AxonautContact> = {}): AxonautContact {
  return {
    id: '10',
    name: 'Dupont SARL',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    email: 'contact@dupont.fr',
    phone: '+33 1 23 45 67 89',
    address: '12 Rue de la Paix',
    zip_code: '75001',
    city: 'Paris',
    country: 'FR',
    is_prospect: false,
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
    expect(result.id).toBe('10')
    expect(result.name).toBe('Dupont SARL')
    expect(result.identification).toBe('12345678900012')
    expect(result.taxNumber).toBe('FR12345678900')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('EUR')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'contact@dupont.fr', type: 'WORK' })
    expect(result.telephones?.[0]).toEqual({ telephone: '+33 1 23 45 67 89', type: 'WORK' })
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('12 Rue de la Paix')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75001')
    expect(result.billingAddress?.country).toBe('FR')
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('sets isSupplier when supplier flag set', () => {
    const result = transformContact(makeContact({ is_customer: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
