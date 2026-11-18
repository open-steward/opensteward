import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AcumaticaContact } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/contact'

function makeContact(overrides: Partial<AcumaticaContact> = {}): AcumaticaContact {
  return {
    ContactID: 'CON0001',
    DisplayName: 'Acme Corp',
    FirstName: 'John',
    LastName: 'Doe',
    Email: 'john@acme.com',
    Phone1: '+1-555-0100',
    Type: 'Customer',
    BusinessAccountID: 'ACC001',
    Address: {
      AddressLine1: '123 Main St',
      AddressLine2: '',
      City: 'New York',
      PostalCode: '10001',
      CountryID: 'US',
    },
    ...overrides,
  }
}

describe('transformContact (Acumatica)', () => {
  it('maps id from ContactID', () => {
    expect(transformContact(makeContact()).id).toBe('CON0001')
  })

  it('maps name from DisplayName', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails?.[0]?.email).toBe('john@acme.com')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones?.[0]?.telephone).toBe('+1-555-0100')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('New York')
    expect(result.billingAddress?.postalCode).toBe('10001')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('sets isCustomer true for Customer type', () => {
    expect(transformContact(makeContact({ Type: 'Customer' })).isCustomer).toBe(true)
    expect(transformContact(makeContact({ Type: 'Customer' })).isSupplier).toBe(false)
  })

  it('sets isSupplier true for Vendor type', () => {
    expect(transformContact(makeContact({ Type: 'Vendor' })).isSupplier).toBe(true)
    expect(transformContact(makeContact({ Type: 'Vendor' })).isCustomer).toBe(false)
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
