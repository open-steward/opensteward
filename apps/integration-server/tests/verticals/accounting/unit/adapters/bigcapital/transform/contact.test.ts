import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type BigcapitalCustomer,
  type BigcapitalVendor,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<BigcapitalCustomer> = {}): BigcapitalCustomer {
  return {
    id: 7,
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    companyName: 'Acme Corp',
    email: 'jane@acme.com',
    workPhone: '+15551234567',
    personalPhone: '+15559876543',
    currencyCode: 'USD',
    active: true,
    billingAddress1: '123 Main St',
    billingAddressCity: 'New York',
    billingAddressState: 'NY',
    billingAddressCountry: 'US',
    billingAddressPostcode: '10001',
    shippingAddress1: '456 Ship Ave',
    shippingAddressCity: 'Brooklyn',
    shippingAddressCountry: 'US',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeVendor(overrides: Partial<BigcapitalVendor> = {}): BigcapitalVendor {
  return {
    id: 12,
    displayName: 'Supplier Ltd',
    companyName: 'Supplier Ltd',
    email: 'orders@supplier.com',
    workPhone: '+442071234567',
    currencyCode: 'GBP',
    active: true,
    billingAddress1: '1 London Rd',
    billingAddressCity: 'London',
    billingAddressCountry: 'GB',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust_7')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.currency).toBe('USD')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.companyName).toBe('Acme Corp')
  })

  it('maps phones as telephones', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.find((t) => t.type === 'WORK')?.telephone).toBe('+15551234567')
    expect(result.telephones!.find((t) => t.type === 'HOME')?.telephone).toBe('+15559876543')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('New York')
    expect(result.shippingAddress?.address1).toBe('456 Ship Ave')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformVendor (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformVendor(makeVendor())
    expect(result.id).toBe('vend_12')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
    expect(result.currency).toBe('GBP')
    expect(result.companyName).toBe('Supplier Ltd')
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformVendor(makeVendor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
