import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type AcconomyContact,
} from '../../../../../../../src/verticals/accounting/adapters/acconomy/transform/contact'

function makeContact(overrides: Partial<AcconomyContact> = {}): AcconomyContact {
  return {
    id: 99,
    name: 'Beta GmbH',
    email: 'contact@beta.de',
    phone: '+49 30 123456',
    address: 'Berliner Str. 5',
    city: 'Berlin',
    postal_code: '10115',
    country: 'DE',
    org_nr: 'HRB 12345',
    vat_nr: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (Acconomy)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('99')
    expect(result.name).toBe('Beta GmbH')
    expect(result.identification).toBe('HRB 12345')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('falls back to vat_nr when org_nr is missing', () => {
    const raw = makeContact({ org_nr: undefined })
    const result = transformContact(raw)
    expect(result.identification).toBe('DE123456789')
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@beta.de')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+49 30 123456')
  })

  it('maps address fields using postal_code', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Berliner Str. 5')
    expect(result.billingAddress?.city).toBe('Berlin')
    expect(result.billingAddress?.postalCode).toBe('10115')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('defaults is_customer to true when not provided', () => {
    const raw = makeContact()
    delete raw.is_customer
    const result = transformContact(raw)
    expect(result.isCustomer).toBe(true)
  })

  it('returns undefined emails when email is missing', () => {
    const result = transformContact(makeContact({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
