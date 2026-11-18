import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MyunisoftContact } from '../../../../../../../src/verticals/accounting/adapters/myunisoft/transform/contact'

function makeContact(overrides: Partial<MyunisoftContact> = {}): MyunisoftContact {
  return {
    id: '12',
    nom: 'Moreau SA',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    email: 'moreau@example.fr',
    telephone: '0234567890',
    adresse: '8 Rue de la Victoire',
    code_postal: '75009',
    ville: 'Paris',
    pays: 'FR',
    est_client: false,
    est_fournisseur: true,
    actif: true,
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('12')
    expect(result.name).toBe('Moreau SA')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75009')
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
