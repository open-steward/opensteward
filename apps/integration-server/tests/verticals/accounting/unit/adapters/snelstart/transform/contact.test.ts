import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SnelStartContact,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/contact'

function makeContact(overrides: Partial<SnelStartContact> = {}): SnelStartContact {
  return {
    id: 'rel-001',
    naam: 'Bakkerij de Groot BV',
    vestigingsnaam: 'Bakkerij de Groot',
    kvkNummer: '12345678',
    email: 'info@bakkerijdegroot.nl',
    telefoon: '+31 20 1234567',
    mobieleTelefoon: '+31 6 12345678',
    adres: {
      straat: 'Keizersgracht 100',
      postcode: '1015 AA',
      plaats: 'Amsterdam',
      land: 'NL',
    },
    relatiesoort: ['Klant'],
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('rel-001')
  })

  it('maps naam to name', () => {
    expect(transformContact(makeContact()).name).toBe('Bakkerij de Groot BV')
  })

  it('maps vestigingsnaam to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Bakkerij de Groot')
  })

  it('maps kvkNummer to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12345678')
  })

  it('maps relatiesoort Klant to isCustomer=true', () => {
    expect(transformContact(makeContact({ relatiesoort: ['Klant'] })).isCustomer).toBe(true)
  })

  it('maps relatiesoort Leverancier to isSupplier=true', () => {
    expect(transformContact(makeContact({ relatiesoort: ['Leverancier'] })).isSupplier).toBe(true)
  })

  it('maps relatiesoort with both roles', () => {
    const c = transformContact(makeContact({ relatiesoort: ['Klant', 'Leverancier'] }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(true)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@bakkerijdegroot.nl', type: 'WORK' })
  })

  it('maps telefoon and mobieleTelefoon to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+31 20 1234567', type: 'WORK' }),
        expect.objectContaining({ telephone: '+31 6 12345678', type: 'MOBILE' }),
      ]),
    )
  })

  it('maps adres to billingAddress', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Keizersgracht 100')
    expect(c.billingAddress?.city).toBe('Amsterdam')
    expect(c.billingAddress?.postalCode).toBe('1015 AA')
    expect(c.billingAddress?.country).toBe('NL')
  })

  it('returns undefined billingAddress when adres is null', () => {
    expect(transformContact(makeContact({ adres: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
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
