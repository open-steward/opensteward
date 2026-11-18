import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type TiimeContact } from '../../../../../../../src/verticals/accounting/adapters/tiime/transform/contact'

function makeContact(overrides: Partial<TiimeContact> = {}): TiimeContact {
  return {
    id: '10',
    nom: 'Acme SAS',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    email: 'contact@acme.fr',
    telephone: '0123456789',
    adresse: '1 Rue de la Paix',
    code_postal: '75001',
    ville: 'Paris',
    pays: 'FR',
    est_client: true,
    est_fournisseur: false,
    actif: true,
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('10')
    expect(result.name).toBe('Acme SAS')
    expect(result.identification).toBe('12345678900012')
    expect(result.taxNumber).toBe('FR12345678900')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('EUR')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]).toEqual({ email: 'contact@acme.fr', type: 'WORK' })
    expect(result.telephones?.[0]).toEqual({ telephone: '0123456789', type: 'WORK' })
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('1 Rue de la Paix')
    expect(result.billingAddress?.city).toBe('Paris')
    expect(result.billingAddress?.postalCode).toBe('75001')
    expect(result.billingAddress?.country).toBe('FR')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const result = transformContact(makeContact({ email: '', telephone: '' }))
    expect(result.emails).toBeUndefined()
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
