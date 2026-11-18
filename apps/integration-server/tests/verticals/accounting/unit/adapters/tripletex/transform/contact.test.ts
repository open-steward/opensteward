import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type TripletexCustomer,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/contact'

function makeContact(overrides: Partial<TripletexCustomer> = {}): TripletexCustomer {
  return {
    id: 200,
    name: 'Acme AS',
    organizationNumber: '987654321',
    email: 'contact@acme.no',
    phoneNumber: '+47 22 11 00 00',
    phoneNumberMobile: '+47 99 88 77 66',
    isCustomer: true,
    isSupplier: false,
    isInactive: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id as string', () => {
    expect(transformContact(makeContact()).id).toBe('200')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Acme AS')
  })

  it('maps organizationNumber to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('987654321')
  })

  it('maps isCustomer correctly', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('maps isSupplier correctly', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('maps isInactive false to isActive true', () => {
    expect(transformContact(makeContact({ isInactive: false })).isActive).toBe(true)
  })

  it('maps isInactive true to isActive false', () => {
    expect(transformContact(makeContact({ isInactive: true })).isActive).toBe(false)
  })

  it('maps email to emails array', () => {
    const c = transformContact(makeContact())
    expect(c.emails).toHaveLength(1)
    expect(c.emails![0].email).toBe('contact@acme.no')
    expect(c.emails![0].type).toBe('WORK')
  })

  it('maps both phone numbers to telephones array', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toHaveLength(2)
    expect(c.telephones![0].telephone).toBe('+47 22 11 00 00')
    expect(c.telephones![0].type).toBe('WORK')
    expect(c.telephones![1].telephone).toBe('+47 99 88 77 66')
    expect(c.telephones![1].type).toBe('MOBILE')
  })

  it('maps physicalAddress to billingAddress', () => {
    const c = transformContact(
      makeContact({
        physicalAddress: {
          addressLine1: 'Storgata 1',
          addressLine2: '',
          city: 'Oslo',
          postalCode: '0150',
          country: { id: 'NO' },
        },
      }),
    )
    expect(c.billingAddress?.address1).toBe('Storgata 1')
    expect(c.billingAddress?.city).toBe('Oslo')
    expect(c.billingAddress?.postalCode).toBe('0150')
    expect(c.billingAddress?.country).toBe('NO')
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
