import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ParasutContact } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/contact'

function makeContact(overrides: Partial<ParasutContact> = {}): ParasutContact {
  return {
    id: 'cont_1',
    type: 'contacts',
    attributes: {
      name: 'Acme Ltd',
      contact_type: 'company',
      email: 'info@acme.com.tr',
      phone: '+90-212-123-4567',
      city: 'Istanbul',
      district: 'Besiktas',
      country: 'TR',
      tax_number: '1234567890',
      is_customer: true,
      is_supplier: false,
    },
    ...overrides,
  }
}

describe('transformContact (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('cont_1')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Ltd')
  })

  it('maps tax number', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('sets isCustomer and isSupplier from attributes', () => {
    const c = transformContact(makeContact())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps email', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.com.tr', type: 'WORK' })
  })

  it('maps phone', () => {
    const c = transformContact(makeContact())
    expect(c.telephones?.[0]).toEqual({ telephone: '+90-212-123-4567', type: 'WORK' })
  })

  it('maps billing address from city and country', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.city).toBe('Istanbul')
    expect(c.billingAddress?.country).toBe('TR')
    expect(c.billingAddress?.region).toBe('Besiktas')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutContact = { id: 'cont_2', type: 'contacts', attributes: {} }
    const c = transformContact(raw)
    expect(c.id).toBe('cont_2')
    expect(c.name).toBeUndefined()
    expect(c.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
