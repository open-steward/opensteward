import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type FikenContact,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/contact'

function makeContact(overrides: Partial<FikenContact> = {}): FikenContact {
  return {
    contactId: 301,
    name: 'Norsk AS',
    email: 'info@norsk.no',
    organizationNumber: '912345678',
    phoneNumber: '+47 22334455',
    customer: true,
    supplier: false,
    currency: 'NOK',
    address: {
      streetAddress: 'Karl Johans gate 1',
      city: 'Oslo',
      postCode: '0154',
      country: 'NO',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps contactId to id as string', () => {
    expect(transformContact(makeContact()).id).toBe('301')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Norsk AS')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('912345678')
  })

  it('maps customer to isCustomer', () => {
    expect(transformContact(makeContact({ customer: true })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ customer: false })).isCustomer).toBe(false)
  })

  it('maps supplier to isSupplier', () => {
    expect(transformContact(makeContact({ supplier: true })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ supplier: false })).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformContact(makeContact()).currency).toBe('NOK')
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@norsk.no', type: 'WORK' })
  })

  it('maps phoneNumber to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+47 22334455', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Karl Johans gate 1')
    expect(c.billingAddress?.city).toBe('Oslo')
    expect(c.billingAddress?.postalCode).toBe('0154')
    expect(c.billingAddress?.country).toBe('NO')
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('returns undefined telephones when phoneNumber is empty', () => {
    expect(transformContact(makeContact({ phoneNumber: '' })).telephones).toBeUndefined()
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
