import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type AkauntingContact,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/contact'

function makeContact(overrides: Partial<AkauntingContact> = {}): AkauntingContact {
  return {
    id: 42,
    name: 'Acme GmbH',
    email: 'info@acme.de',
    phone: '+49 30 12345678',
    tax_number: 'DE123456789',
    currency_code: 'EUR',
    type: 'customer',
    enabled: true,
    address: 'Hauptstrasse 10',
    city: 'Berlin',
    zip_code: '10115',
    state: 'Berlin',
    country: 'DE',
    website: 'https://acme.de',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id as string', () => {
    expect(transformContact(makeContact()).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme GmbH')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('DE123456789')
  })

  it('maps type customer to isCustomer true', () => {
    expect(transformContact(makeContact({ type: 'customer' })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ type: 'customer' })).isSupplier).toBe(false)
  })

  it('maps type vendor to isSupplier true', () => {
    expect(transformContact(makeContact({ type: 'vendor' })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ type: 'vendor' })).isCustomer).toBe(false)
  })

  it('maps enabled to isActive', () => {
    expect(transformContact(makeContact({ enabled: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ enabled: false })).isActive).toBe(false)
  })

  it('maps currency_code to currency', () => {
    expect(transformContact(makeContact()).currency).toBe('EUR')
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.de', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+49 30 12345678', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Hauptstrasse 10')
    expect(c.billingAddress?.city).toBe('Berlin')
    expect(c.billingAddress?.postalCode).toBe('10115')
    expect(c.billingAddress?.region).toBe('Berlin')
    expect(c.billingAddress?.country).toBe('DE')
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
