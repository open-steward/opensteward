import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DolibarrThirdParty } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/contact'

function makeRaw(overrides: Partial<DolibarrThirdParty> = {}): DolibarrThirdParty {
  return {
    id: 15,
    name: 'Acme Corp',
    email: 'contact@acme.fr',
    phone: '+33 1 23 45 67 89',
    fax: '+33 1 23 45 67 90',
    address: '12 Rue de la Paix',
    zip: '75001',
    town: 'Paris',
    country_code: 'FR',
    client: 1,
    fournisseur: 0,
    status: 1,
    tva_intra: 'FR12345678901',
    ...overrides,
  }
}

describe('transformContact (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('15')
    expect(result.name).toBe('Acme Corp')
    expect(result.taxNumber).toBe('FR12345678901')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps supplier flag', () => {
    const result = transformContact(makeRaw({ client: 0, fournisseur: 1 }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps emails and telephones', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@acme.fr')
    expect(result.telephones).toHaveLength(2)
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('12 Rue de la Paix')
    expect(result.billingAddress?.postalCode).toBe('75001')
    expect(result.billingAddress?.city).toBe('Paris')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
