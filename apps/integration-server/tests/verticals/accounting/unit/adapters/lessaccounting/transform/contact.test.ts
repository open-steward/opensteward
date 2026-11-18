import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type LessAccountingContact,
} from '../../../../../../../src/verticals/accounting/adapters/lessaccounting/transform/contact'

function makeContact(overrides: Partial<LessAccountingContact> = {}): LessAccountingContact {
  return {
    id: 'contact-1',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+1 555-1234',
    company: 'Acme Corp',
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('John Smith')
  })

  it('maps company to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corp')
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

  it('maps email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'john@example.com', type: 'WORK' })
  })

  it('maps phone to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+1 555-1234', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('New York')
    expect(c.billingAddress?.region).toBe('NY')
    expect(c.billingAddress?.postalCode).toBe('10001')
    expect(c.billingAddress?.country).toBe('US')
  })

  it('returns undefined billingAddress when address is null', () => {
    expect(transformContact(makeContact({ address: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('returns undefined companyName when company is empty', () => {
    expect(transformContact(makeContact({ company: '' })).companyName).toBeUndefined()
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
