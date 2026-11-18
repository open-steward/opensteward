import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformVendor,
  type QBOCustomer,
  type QBOVendor,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/contact'

function makeCustomer(overrides: Partial<QBOCustomer> = {}): QBOCustomer {
  return {
    Id: '15',
    DisplayName: 'John Smith',
    GivenName: 'John',
    FamilyName: 'Smith',
    CompanyName: 'Smith Co',
    Active: true,
    PrimaryEmailAddr: { Address: 'john@smithco.com' },
    PrimaryPhone: { FreeFormNumber: '+15551234567' },
    BillAddr: {
      Line1: '123 Main St',
      City: 'Springfield',
      PostalCode: '62701',
      Country: 'US',
    },
    ShipAddr: {
      Line1: '456 Oak Ave',
      City: 'Springfield',
      PostalCode: '62702',
      Country: 'US',
    },
    CurrencyRef: { value: 'USD' },
    ...overrides,
  }
}

function makeVendor(overrides: Partial<QBOVendor> = {}): QBOVendor {
  return {
    Id: '30',
    DisplayName: 'Supplies Inc',
    GivenName: '',
    FamilyName: '',
    CompanyName: 'Supplies Inc',
    Active: true,
    PrimaryEmailAddr: { Address: 'orders@suppliesinc.com' },
    PrimaryPhone: { FreeFormNumber: '+15559876543' },
    BillAddr: {
      Line1: '789 Elm St',
      City: 'Shelbyville',
      PostalCode: '37160',
      Country: 'US',
    },
    CurrencyRef: { value: 'USD' },
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('prefixes id with cust_', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_15')
  })

  it('maps DisplayName to name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('John Smith')
  })

  it('maps GivenName to firstName', () => {
    expect(transformCustomer(makeCustomer()).firstName).toBe('John')
  })

  it('maps FamilyName to lastName', () => {
    expect(transformCustomer(makeCustomer()).lastName).toBe('Smith')
  })

  it('maps CompanyName correctly', () => {
    expect(transformCustomer(makeCustomer()).companyName).toBe('Smith Co')
  })

  it('sets isCustomer true and isSupplier false', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps Active to isActive', () => {
    expect(transformCustomer(makeCustomer({ Active: false })).isActive).toBe(false)
  })

  it('maps PrimaryEmailAddr to emails', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.emails).toHaveLength(1)
    expect(c.emails![0].email).toBe('john@smithco.com')
  })

  it('maps PrimaryPhone to telephones', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.telephones).toHaveLength(1)
    expect(c.telephones![0].telephone).toBe('+15551234567')
  })

  it('maps BillAddr to billingAddress', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('Springfield')
    expect(c.billingAddress?.postalCode).toBe('62701')
  })

  it('maps ShipAddr to shippingAddress', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.shippingAddress?.address1).toBe('456 Oak Ave')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformCustomer(makeCustomer()).currency).toBe('USD')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformVendor', () => {
  it('prefixes id with vend_', () => {
    expect(transformVendor(makeVendor()).id).toBe('vend_30')
  })

  it('sets isCustomer false and isSupplier true', () => {
    const v = transformVendor(makeVendor())
    expect(v.isCustomer).toBe(false)
    expect(v.isSupplier).toBe(true)
  })

  it('maps DisplayName to name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Supplies Inc')
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })
})
