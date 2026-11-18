import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type EvolizContact } from '../../../../../../../src/verticals/accounting/adapters/evoliz/transform/contact'

function makeContact(overrides: Partial<EvolizContact> = {}): EvolizContact {
  return {
    id: '11',
    name: 'Petit & Fils',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    email: 'petit@example.fr',
    phone: '0456789123',
    address: '7 Cours Mirabeau',
    zip: '13100',
    city: 'Aix-en-Provence',
    country: 'FR',
    is_customer: true,
    is_supplier: false,
    active: true,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('11')
    expect(result.name).toBe('Petit & Fils')
    expect(result.isCustomer).toBe(true)
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Aix-en-Provence')
    expect(result.billingAddress?.postalCode).toBe('13100')
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
