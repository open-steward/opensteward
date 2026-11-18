import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type IpaidthatContact } from '../../../../../../../src/verticals/accounting/adapters/ipaidthat/transform/contact'

function makeContact(overrides: Partial<IpaidthatContact> = {}): IpaidthatContact {
  return {
    id: '9',
    nom: 'Lefebvre SARL',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    email: 'lefebvre@example.fr',
    telephone: '0345678901',
    adresse: '22 Rue des Arts',
    code_postal: '69001',
    ville: 'Lyon',
    pays: 'FR',
    est_client: true,
    est_fournisseur: false,
    actif: true,
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('9')
    expect(result.name).toBe('Lefebvre SARL')
    expect(result.isCustomer).toBe(true)
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Lyon')
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
