import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type TwinfieldContact,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/contact'

function makeContact(overrides: Partial<TwinfieldContact> = {}): TwinfieldContact {
  return {
    code: 'DEB-001',
    name: 'Acme BV',
    type: 'DEB',
    shortName: 'Acme',
    vatNumber: 'NL123456789B01',
    website: 'https://acme.nl',
    email: 'info@acme.nl',
    phone: '+31 20 1234567',
    fax: '+31 20 7654321',
    addressLine1: 'Herengracht 100',
    addressLine2: 'Suite 5',
    city: 'Amsterdam',
    postcode: '1015 AA',
    country: 'NL',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps code to id', () => {
    expect(transformContact(makeContact()).id).toBe('DEB-001')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme BV')
  })

  it('maps shortName to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('NL123456789B01')
  })

  it('maps type DEB to isCustomer true', () => {
    expect(transformContact(makeContact({ type: 'DEB' })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ type: 'DEB' })).isSupplier).toBe(false)
  })

  it('maps type CRE to isSupplier true', () => {
    expect(transformContact(makeContact({ type: 'CRE' })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ type: 'CRE' })).isCustomer).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.nl', type: 'WORK' })
  })

  it('maps phone and fax to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+31 20 1234567', type: 'WORK' }),
        expect.objectContaining({ telephone: '+31 20 7654321', type: 'FAX' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Herengracht 100')
    expect(c.billingAddress?.address2).toBe('Suite 5')
    expect(c.billingAddress?.city).toBe('Amsterdam')
    expect(c.billingAddress?.postalCode).toBe('1015 AA')
    expect(c.billingAddress?.country).toBe('NL')
  })

  it('returns undefined emails when email is empty', () => {
    const c = transformContact(makeContact({ email: '' }))
    expect(c.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone and fax are empty', () => {
    const c = transformContact(makeContact({ phone: '', fax: '' }))
    expect(c.telephones).toBeUndefined()
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
