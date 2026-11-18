import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PowerOfficeContact,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/contact'

function makeContact(overrides: Partial<PowerOfficeContact> = {}): PowerOfficeContact {
  return {
    id: 99,
    code: 'C-001',
    name: 'Acme Corp',
    emailAddress: 'billing@acme.com',
    phoneNumber: '+4712345678',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currencyCode: 'NOK',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('99')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps isCustomer correctly', () => {
    expect(transformContact(makeContact({ isCustomer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ isCustomer: false })).isCustomer).toBe(false)
  })

  it('maps isSupplier correctly', () => {
    expect(transformContact(makeContact({ isSupplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ isSupplier: false })).isSupplier).toBe(false)
  })

  it('maps isActive correctly', () => {
    expect(transformContact(makeContact({ isActive: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ isActive: false })).isActive).toBe(false)
  })

  it('maps currencyCode to currency', () => {
    expect(transformContact(makeContact()).currency).toBe('NOK')
  })

  it('maps emailAddress to emails array with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toEqual([{ email: 'billing@acme.com', type: 'WORK' }])
  })

  it('sets emails to undefined when emailAddress is empty', () => {
    expect(transformContact(makeContact({ emailAddress: '' })).emails).toBeUndefined()
  })

  it('maps phoneNumber to telephones array with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toEqual([{ telephone: '+4712345678', type: 'WORK' }])
  })

  it('sets telephones to undefined when phoneNumber is empty', () => {
    expect(transformContact(makeContact({ phoneNumber: '' })).telephones).toBeUndefined()
  })

  it('maps mailAddress to billingAddress', () => {
    const result = transformContact(
      makeContact({
        mailAddress: {
          addressLine1: '123 Main St',
          postalCode: '0150',
          city: 'Oslo',
          countryCode: 'NO',
        },
      }),
    )
    expect(result.billingAddress).toEqual({
      address1: '123 Main St',
      postalCode: '0150',
      city: 'Oslo',
      country: 'NO',
    })
  })

  it('sets billingAddress to undefined when mailAddress is absent', () => {
    expect(transformContact(makeContact({ mailAddress: undefined })).billingAddress).toBeUndefined()
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
