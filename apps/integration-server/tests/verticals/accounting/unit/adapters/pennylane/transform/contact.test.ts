import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PennylaneContact,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/contact'

function makeContact(overrides: Partial<PennylaneContact> = {}): PennylaneContact {
  return {
    source_id: 'cnt-1',
    name: 'Jean Dupont',
    first_name: 'Jean',
    last_name: 'Dupont',
    email: 'jean@example.com',
    phone: '+33 1 00 00 00 00',
    address: {
      street: '1 Rue de Rivoli',
      postal_code: '75001',
      city: 'Paris',
      country_alpha2: 'FR',
    },
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps source_id to id', () => {
    expect(transformContact(makeContact()).id).toBe('cnt-1')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Jean Dupont')
  })

  it('maps first_name to firstName', () => {
    expect(transformContact(makeContact()).firstName).toBe('Jean')
  })

  it('maps last_name to lastName', () => {
    expect(transformContact(makeContact()).lastName).toBe('Dupont')
  })

  it('maps is_customer correctly', () => {
    expect(transformContact(makeContact({ is_customer: true })).isCustomer).toBe(true)
  })

  it('maps is_supplier correctly', () => {
    expect(transformContact(makeContact({ is_supplier: true })).isSupplier).toBe(true)
  })

  it('maps email into emails array as WORK', () => {
    expect(transformContact(makeContact()).emails).toEqual([{ email: 'jean@example.com', type: 'WORK' }])
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('maps phone into telephones array as WORK', () => {
    expect(transformContact(makeContact()).telephones).toEqual([
      { telephone: '+33 1 00 00 00 00', type: 'WORK' },
    ])
  })

  it('returns undefined telephones when phone is empty', () => {
    expect(transformContact(makeContact({ phone: '' })).telephones).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const addr = transformContact(makeContact()).billingAddress
    expect(addr?.address1).toBe('1 Rue de Rivoli')
    expect(addr?.postalCode).toBe('75001')
    expect(addr?.city).toBe('Paris')
    expect(addr?.country).toBe('FR')
  })

  it('returns undefined billingAddress when address is null', () => {
    expect(transformContact(makeContact({ address: null })).billingAddress).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
