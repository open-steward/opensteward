import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type BillyContact,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/contact'

function makeContact(overrides: Partial<BillyContact> = {}): BillyContact {
  return {
    id: 'contact-1',
    name: 'Acme ApS',
    countryId: 'DK',
    street: 'Vestergade 10',
    cityText: 'Copenhagen',
    stateText: 'Hovedstaden',
    zipcodeText: '1456',
    phone: '+45 12345678',
    fax: '+45 87654321',
    contactNo: 'C-001',
    registrationNo: 'DK12345678',
    currencyId: 'DKK',
    isDebitor: true,
    isCreditor: false,
    contactPersons: [{ email: 'info@acme.dk' }],
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme ApS')
  })

  it('maps registrationNo to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('DK12345678')
  })

  it('maps isDebitor to isCustomer', () => {
    expect(transformContact(makeContact({ isDebitor: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ isDebitor: false })).isCustomer).toBe(false)
  })

  it('maps isCreditor to isSupplier', () => {
    expect(transformContact(makeContact({ isCreditor: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ isCreditor: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currencyId to currency', () => {
    expect(transformContact(makeContact()).currency).toBe('DKK')
  })

  it('maps contactPersons email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.dk', type: 'WORK' })
  })

  it('maps phone and fax to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+45 12345678', type: 'WORK' }),
        expect.objectContaining({ telephone: '+45 87654321', type: 'FAX' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Vestergade 10')
    expect(c.billingAddress?.city).toBe('Copenhagen')
    expect(c.billingAddress?.region).toBe('Hovedstaden')
    expect(c.billingAddress?.postalCode).toBe('1456')
    expect(c.billingAddress?.country).toBe('DK')
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
