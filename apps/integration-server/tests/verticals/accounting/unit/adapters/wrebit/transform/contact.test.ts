import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type WrebitContact,
} from '../../../../../../../src/verticals/accounting/adapters/wrebit/transform/contact'

function makeContact(overrides: Partial<WrebitContact> = {}): WrebitContact {
  return {
    id: 99,
    name: 'Handel & Logistik AB',
    email: 'kontakt@handel.se',
    phone: '+46706677889',
    address: 'Lagervägen 15',
    city: 'Helsingborg',
    zip: '252 25',
    country: 'SE',
    org_number: '556888-4321',
    customer: true,
    supplier: false,
    ...overrides,
  }
}

describe('transformContact (Wrebit)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('99')
    expect(result.name).toBe('Handel & Logistik AB')
    expect(result.identification).toBe('556888-4321')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('kontakt@handel.se')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Lagervägen 15')
    expect(result.billingAddress?.city).toBe('Helsingborg')
    expect(result.billingAddress?.postalCode).toBe('252 25')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps supplier flag correctly', () => {
    expect(transformContact(makeContact({ supplier: true })).isSupplier).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
