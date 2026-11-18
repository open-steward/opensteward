import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type PEAccountingContact,
} from '../../../../../../../src/verticals/accounting/adapters/peaccounting/transform/contact'

function makeContact(overrides: Partial<PEAccountingContact> = {}): PEAccountingContact {
  return {
    id: 42,
    name: 'Acme AB',
    email: 'info@acme.se',
    phone: '+46 70 123 4567',
    address: 'Storgatan 1',
    city: 'Stockholm',
    zip: '111 22',
    country: 'SE',
    org_number: '556123-4567',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (PE Accounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('42')
    expect(result.name).toBe('Acme AB')
    expect(result.identification).toBe('556123-4567')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.se')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephones array', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+46 70 123 4567')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Storgatan 1')
    expect(result.billingAddress?.city).toBe('Stockholm')
    expect(result.billingAddress?.postalCode).toBe('111 22')
    expect(result.billingAddress?.country).toBe('SE')
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

  it('returns undefined billingAddress when no address fields', () => {
    const result = transformContact(makeContact({ address: undefined, city: undefined, zip: undefined, country: undefined }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
