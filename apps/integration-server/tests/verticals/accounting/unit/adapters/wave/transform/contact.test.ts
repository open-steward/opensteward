import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type WaveContact,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/contact'

function makeContact(overrides: Partial<WaveContact> = {}): WaveContact {
  return {
    id: 'contact-1',
    name: 'Acme Corp',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@acme.com',
    phone: '+1 555-1234',
    address: {
      addressLine1: '123 Main St',
      city: 'Toronto',
      province: { code: 'ON' },
      postalCode: 'M5V 1A1',
      country: { code: 'CA' },
    },
    currency: { code: 'CAD' },
    createdAt: '2024-01-10T10:00:00Z',
    modifiedAt: '2024-01-10T10:00:00Z',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from raw id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps firstName', () => {
    expect(transformContact(makeContact()).firstName).toBe('John')
  })

  it('maps lastName', () => {
    expect(transformContact(makeContact()).lastName).toBe('Doe')
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
    expect(c.emails?.[0]).toEqual({ email: 'john@acme.com', type: 'WORK' })
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
    expect(c.billingAddress?.city).toBe('Toronto')
    expect(c.billingAddress?.region).toBe('ON')
    expect(c.billingAddress?.postalCode).toBe('M5V 1A1')
    expect(c.billingAddress?.country).toBe('CA')
  })

  it('returns undefined billingAddress when address is null', () => {
    expect(transformContact(makeContact({ address: null })).billingAddress).toBeUndefined()
  })

  it('returns undefined emails when email is empty', () => {
    expect(transformContact(makeContact({ email: '' })).emails).toBeUndefined()
  })

  it('maps currency.code to currency', () => {
    expect(transformContact(makeContact()).currency).toBe('CAD')
  })

  it('returns undefined name when name is empty', () => {
    expect(transformContact(makeContact({ name: '' })).name).toBeUndefined()
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
