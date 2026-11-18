import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PandleContact,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/contact'

function makeContact(overrides: Partial<PandleContact> = {}): PandleContact {
  return {
    id: 100,
    name: 'Acme Ltd',
    company_name: 'Acme Limited',
    email: 'info@acme.co.uk',
    phone: '+44 20 7946 0958',
    mobile: '+44 7700 900000',
    vat_number: 'GB123456789',
    address_line_1: '10 Downing Street',
    address_line_2: 'Suite 5',
    city: 'London',
    region: 'Greater London',
    postcode: 'SW1A 2AA',
    country: 'GB',
    contact_type: 'customer',
    is_active: true,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id as string', () => {
    expect(transformContact(makeContact()).id).toBe('100')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Ltd')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Limited')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('GB123456789')
  })

  it('maps contact_type customer to isCustomer=true, isSupplier=false', () => {
    const c = transformContact(makeContact({ contact_type: 'customer' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps contact_type supplier to isCustomer=false, isSupplier=true', () => {
    const c = transformContact(makeContact({ contact_type: 'supplier' }))
    expect(c.isCustomer).toBe(false)
    expect(c.isSupplier).toBe(true)
  })

  it('maps contact_type both to isCustomer=true, isSupplier=true', () => {
    const c = transformContact(makeContact({ contact_type: 'both' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(true)
  })

  it('maps is_active to isActive', () => {
    expect(transformContact(makeContact({ is_active: true })).isActive).toBe(true)
    expect(transformContact(makeContact({ is_active: false })).isActive).toBe(false)
  })

  it('maps email to emails array', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.co.uk', type: 'WORK' })
  })

  it('maps phone and mobile to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+44 20 7946 0958', type: 'WORK' }),
        expect.objectContaining({ telephone: '+44 7700 900000', type: 'MOBILE' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('10 Downing Street')
    expect(c.billingAddress?.address2).toBe('Suite 5')
    expect(c.billingAddress?.city).toBe('London')
    expect(c.billingAddress?.region).toBe('Greater London')
    expect(c.billingAddress?.postalCode).toBe('SW1A 2AA')
    expect(c.billingAddress?.country).toBe('GB')
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
