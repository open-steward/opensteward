import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SapB1BusinessPartner,
  type SapB1BpAddress,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/contact'

function makeBpAddress(overrides: Partial<SapB1BpAddress> = {}): SapB1BpAddress {
  return {
    AddressName: 'Main',
    Street: '123 Main St',
    City: 'Springfield',
    ZipCode: '62701',
    Country: 'US',
    ...overrides,
  }
}

function makeContact(overrides: Partial<SapB1BusinessPartner> = {}): SapB1BusinessPartner {
  return {
    CardCode: 'BP-001',
    CardName: 'Acme Corp',
    CardType: 'cCustomer',
    EmailAddress: 'info@acme.com',
    Phone1: '+1-555-0100',
    Fax: '',
    Currency: 'USD',
    Active: 'tYES',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps CardCode to id', () => {
    expect(transformContact(makeContact()).id).toBe('BP-001')
  })

  it('maps CardName to name', () => {
    expect(transformContact(makeContact()).name).toBe('Acme Corp')
  })

  it('maps CardType cCustomer to isCustomer true', () => {
    expect(transformContact(makeContact({ CardType: 'cCustomer' })).isCustomer).toBe(true)
  })

  it('maps CardType cSupplier to isCustomer false and isSupplier true', () => {
    const result = transformContact(makeContact({ CardType: 'cSupplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps Active tYES to isActive true', () => {
    expect(transformContact(makeContact({ Active: 'tYES' })).isActive).toBe(true)
  })

  it('maps Active tNO to isActive false', () => {
    expect(transformContact(makeContact({ Active: 'tNO' })).isActive).toBe(false)
  })

  it('maps Currency correctly', () => {
    expect(transformContact(makeContact()).currency).toBe('USD')
  })

  it('maps EmailAddress to emails with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toEqual([{ email: 'info@acme.com', type: 'WORK' }])
  })

  it('omits emails when EmailAddress is empty', () => {
    expect(transformContact(makeContact({ EmailAddress: '' })).emails).toBeUndefined()
  })

  it('maps Phone1 to telephones with WORK type', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toContainEqual({ telephone: '+1-555-0100', type: 'WORK' })
  })

  it('maps Fax to telephones with FAX type', () => {
    const result = transformContact(makeContact({ Fax: '+1-555-0199' }))
    expect(result.telephones).toContainEqual({ telephone: '+1-555-0199', type: 'FAX' })
  })

  it('omits telephones when both Phone1 and Fax are empty', () => {
    expect(transformContact(makeContact({ Phone1: '', Fax: '' })).telephones).toBeUndefined()
  })

  it('maps BillingAddress to billingAddress', () => {
    const result = transformContact(makeContact({ BillingAddress: makeBpAddress() }))
    expect(result.billingAddress).toEqual({
      address1: '123 Main St',
      city: 'Springfield',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('maps ShippingAddress to shippingAddress', () => {
    const result = transformContact(makeContact({ ShippingAddress: makeBpAddress({ Street: '456 Elm St' }) }))
    expect(result.shippingAddress?.address1).toBe('456 Elm St')
  })

  it('omits billingAddress when BillingAddress is absent', () => {
    expect(transformContact(makeContact()).billingAddress).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
