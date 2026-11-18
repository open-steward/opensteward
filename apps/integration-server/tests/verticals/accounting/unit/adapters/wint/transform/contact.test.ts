import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type WintContact,
} from '../../../../../../../src/verticals/accounting/adapters/wint/transform/contact'

function makeContact(overrides: Partial<WintContact> = {}): WintContact {
  return {
    id: 77,
    name: 'Nordic Solutions AB',
    email: 'hello@nordicsolutions.se',
    phone: '+46739876543',
    address: 'Vasagatan 5',
    city: 'Malmö',
    zip: '211 22',
    country: 'SE',
    org_nr: '556777-8888',
    customer: true,
    supplier: false,
    ...overrides,
  }
}

describe('transformContact (Wint)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('77')
    expect(result.name).toBe('Nordic Solutions AB')
    expect(result.identification).toBe('556777-8888')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('hello@nordicsolutions.se')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+46739876543')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Vasagatan 5')
    expect(result.billingAddress?.city).toBe('Malmö')
    expect(result.billingAddress?.postalCode).toBe('211 22')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined emails when email absent', () => {
    const result = transformContact(makeContact({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('defaults customer to true when not provided', () => {
    const raw = makeContact()
    delete raw.customer
    const result = transformContact(raw)
    expect(result.isCustomer).toBe(true)
  })

  it('can be both customer and supplier', () => {
    const result = transformContact(makeContact({ customer: true, supplier: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
