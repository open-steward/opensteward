import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type DatevContact } from '../../../../../../../src/verticals/accounting/adapters/datev/transform/contact'

function makeContact(overrides: Partial<DatevContact> = {}): DatevContact {
  return {
    id: 'cust-1',
    name: 'Mustermann GmbH',
    email_address: 'info@mustermann.de',
    phone: '+49 89 123456',
    street: 'Musterstraße 1',
    zip_code: '80331',
    city: 'München',
    country_code: 'DE',
    tax_number: 'DE123456789',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (DATEV)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0]!.email).toBe('info@mustermann.de')
  })

  it('maps phone correctly', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0]!.telephone).toBe('+49 89 123456')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Musterstraße 1')
    expect(result.billingAddress?.postalCode).toBe('80331')
    expect(result.billingAddress?.city).toBe('München')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
