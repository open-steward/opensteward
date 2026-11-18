import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type HoldedContact,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/contact'

function makeContact(overrides: Partial<HoldedContact> = {}): HoldedContact {
  return {
    id: 'contact-1',
    name: 'Empresa SL',
    email: 'info@empresa.es',
    phone: '+34 912345678',
    mobile: '+34 612345678',
    vatnumber: 'B12345678',
    tradeName: 'Empresa Trading SL',
    type: 'client',
    billAddress: {
      address: 'Calle Mayor 10',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
    isPerson: false,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Empresa SL')
  })

  it('maps tradeName to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Empresa Trading SL')
  })

  it('maps vatnumber to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('B12345678')
  })

  it('maps type=client to isCustomer=true', () => {
    expect(transformContact(makeContact({ type: 'client' })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ type: 'client' })).isSupplier).toBe(false)
  })

  it('maps type=supplier to isSupplier=true', () => {
    expect(transformContact(makeContact({ type: 'supplier' })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ type: 'supplier' })).isCustomer).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@empresa.es', type: 'WORK' })
  })

  it('maps phone and mobile to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+34 912345678', type: 'WORK' }),
        expect.objectContaining({ telephone: '+34 612345678', type: 'MOBILE' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Calle Mayor 10')
    expect(c.billingAddress?.city).toBe('Madrid')
    expect(c.billingAddress?.region).toBe('Madrid')
    expect(c.billingAddress?.postalCode).toBe('28001')
    expect(c.billingAddress?.country).toBe('ES')
  })

  it('returns undefined billingAddress when billAddress is null', () => {
    expect(transformContact(makeContact({ billAddress: null })).billingAddress).toBeUndefined()
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
