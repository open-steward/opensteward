import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SellsyContact,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/contact'

function makeContact(overrides: Partial<SellsyContact> = {}): SellsyContact {
  return {
    id: 'contact-1',
    first_name: 'Jean',
    last_name: 'Dupont',
    company_name: 'Dupont SARL',
    email: 'jean@dupont.fr',
    phone: '+33 1 23 45 67 89',
    mobile: '+33 6 12 34 56 78',
    siret: '12345678901234',
    vat_number: 'FR12345678901',
    is_customer: true,
    is_supplier: false,
    currency: 'EUR',
    address_line_1: '10 Rue de la Paix',
    address_line_2: 'Étage 3',
    city: 'Paris',
    postal_code: '75002',
    region: 'Île-de-France',
    country: 'FR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps company_name to name when present', () => {
    expect(transformContact(makeContact()).name).toBe('Dupont SARL')
  })

  it('falls back to first + last name when company_name is empty', () => {
    expect(transformContact(makeContact({ company_name: '' })).name).toBe('Jean Dupont')
  })

  it('maps first_name to firstName', () => {
    expect(transformContact(makeContact()).firstName).toBe('Jean')
  })

  it('maps last_name to lastName', () => {
    expect(transformContact(makeContact()).lastName).toBe('Dupont')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Dupont SARL')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('FR12345678901')
  })

  it('maps siret to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('12345678901234')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformContact(makeContact({ is_customer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ is_customer: false })).isCustomer).toBe(false)
  })

  it('maps is_supplier to isSupplier', () => {
    expect(transformContact(makeContact({ is_supplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ is_supplier: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformContact(makeContact()).currency).toBe('EUR')
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'jean@dupont.fr', type: 'WORK' })
  })

  it('maps phone and mobile to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+33 1 23 45 67 89', type: 'WORK' }),
        expect.objectContaining({ telephone: '+33 6 12 34 56 78', type: 'MOBILE' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('10 Rue de la Paix')
    expect(c.billingAddress?.address2).toBe('Étage 3')
    expect(c.billingAddress?.city).toBe('Paris')
    expect(c.billingAddress?.postalCode).toBe('75002')
    expect(c.billingAddress?.region).toBe('Île-de-France')
    expect(c.billingAddress?.country).toBe('FR')
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
