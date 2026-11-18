import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type FakturoidContact,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/contact'

function makeContact(overrides: Partial<FakturoidContact> = {}): FakturoidContact {
  return {
    id: 100,
    name: 'Firma s.r.o.',
    full_name: 'Firma s.r.o.',
    email: 'info@firma.cz',
    phone: '+420 123456789',
    web: 'https://firma.cz',
    street: 'Narodni 10',
    city: 'Prague',
    zip: '11000',
    country: 'CZ',
    registration_no: '12345678',
    vat_no: 'CZ12345678',
    type: 'customer',
    bank_account: '1234567890/0100',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id as string', () => {
    expect(transformContact(makeContact()).id).toBe('100')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Firma s.r.o.')
  })

  it('maps name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Firma s.r.o.')
  })

  it('maps vat_no to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('CZ12345678')
  })

  it('maps registration_no to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('12345678')
  })

  it('maps type customer to isCustomer=true', () => {
    expect(transformContact(makeContact({ type: 'customer' })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ type: 'customer' })).isSupplier).toBe(false)
  })

  it('maps type supplier to isSupplier=true', () => {
    expect(transformContact(makeContact({ type: 'supplier' })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ type: 'supplier' })).isCustomer).toBe(false)
  })

  it('maps type both to isCustomer=true and isSupplier=true', () => {
    const c = transformContact(makeContact({ type: 'both' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(true)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@firma.cz', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+420 123456789', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Narodni 10')
    expect(c.billingAddress?.city).toBe('Prague')
    expect(c.billingAddress?.postalCode).toBe('11000')
    expect(c.billingAddress?.country).toBe('CZ')
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
