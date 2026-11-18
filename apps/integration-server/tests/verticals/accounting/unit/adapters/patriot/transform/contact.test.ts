import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PatriotContact,
} from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/contact'

function makeContact(overrides: Partial<PatriotContact> = {}): PatriotContact {
  return {
    id: 'contact-1',
    name: 'John Smith',
    email: 'john@smith.com',
    phone: '+1 555-123-4567',
    company_name: 'Smith LLC',
    tax_id: '12-3456789',
    address: {
      line1: '123 Main St',
      city: 'Columbus',
      state: 'OH',
      zip: '43215',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps company_name to name when present', () => {
    expect(transformContact(makeContact()).name).toBe('Smith LLC')
  })

  it('falls back to name when company_name is empty', () => {
    expect(transformContact(makeContact({ company_name: '' })).name).toBe('John Smith')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Smith LLC')
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12-3456789')
  })

  it('sets isCustomer to true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier to false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('sets isActive to true', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps currency to USD', () => {
    expect(transformContact(makeContact()).currency).toBe('USD')
  })

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'john@smith.com', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1 555-123-4567', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('Columbus')
    expect(c.billingAddress?.region).toBe('OH')
    expect(c.billingAddress?.postalCode).toBe('43215')
    expect(c.billingAddress?.country).toBe('US')
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
