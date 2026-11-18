import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type TwentyFourSevenContact,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/contact'

function makeContact(overrides: Partial<TwentyFourSevenContact> = {}): TwentyFourSevenContact {
  return {
    id: 'contact-1',
    name: 'Nordic Consulting AS',
    companyName: 'Nordic Consulting AS',
    organizationNumber: 'NO123456789',
    email: 'post@nordic.no',
    phone: '+47 22334455',
    fax: '+47 22334456',
    street: 'Karl Johans gate 10',
    city: 'Oslo',
    postalCode: '0154',
    country: 'NO',
    isCustomer: true,
    isSupplier: false,
    currency: 'NOK',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Nordic Consulting AS')
  })

  it('maps companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Nordic Consulting AS')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('NO123456789')
  })

  it('maps isCustomer', () => {
    expect(transformContact(makeContact({ isCustomer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ isCustomer: false })).isCustomer).toBe(false)
  })

  it('maps isSupplier', () => {
    expect(transformContact(makeContact({ isSupplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ isSupplier: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformContact(makeContact()).currency).toBe('NOK')
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'post@nordic.no', type: 'WORK' })
  })

  it('maps phone and fax to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+47 22334455', type: 'WORK' }),
        expect.objectContaining({ telephone: '+47 22334456', type: 'FAX' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Karl Johans gate 10')
    expect(c.billingAddress?.city).toBe('Oslo')
    expect(c.billingAddress?.postalCode).toBe('0154')
    expect(c.billingAddress?.country).toBe('NO')
  })

  it('returns undefined emails when email is empty', () => {
    const c = transformContact(makeContact({ email: '' }))
    expect(c.emails).toBeUndefined()
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
