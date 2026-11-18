import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawShift4ShopCustomer,
  type RawShift4ShopCustomerAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/shift4shop/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeAddress(overrides: Partial<RawShift4ShopCustomerAddress> = {}): RawShift4ShopCustomerAddress {
  return {
    FirstName: 'Jane',
    LastName: 'Doe',
    Address: '123 Main St',
    Address2: 'Apt 4',
    City: 'Springfield',
    State: 'IL',
    Zip: '62701',
    Country: 'US',
    Phone: '+1-555-0100',
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<RawShift4ShopCustomer> = {}): RawShift4ShopCustomer {
  return {
    CustomerID: 7001,
    EMail: 'jane@example.com',
    FirstName: 'Jane',
    LastName: 'Doe',
    Phone: '+1-555-0100',
    DateCreated: '2023-06-15T08:30:00.000Z',
    LastLogin: '2024-04-10T14:20:00.000Z',
    MailList: 1,
    OrdersCount: 5,
    TotalOrdered: 299.95,
    BillingAddress: makeAddress(),
    ShippingAddressList: [],
    ...overrides,
  }
}

describe('transformCustomer (Shift4Shop)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps phone from root customer field', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+1-555-0100')
  })

  it('falls back to billing address phone when root phone is absent', () => {
    const result = transformCustomer(makeCustomer({ Phone: null }))
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps acceptsMarketing from MailList=1', () => {
    const result = transformCustomer(makeCustomer({ MailList: 1 }))
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps acceptsMarketing=false from MailList=0', () => {
    const result = transformCustomer(makeCustomer({ MailList: 0 }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps ordersCount and totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(5)
    expect(result.totalSpent).toEqual({ amount: 29995, currency: 'USD' })
  })

  it('maps defaultAddress from BillingAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('123 Main St')
    expect(result.defaultAddress!.line2).toBe('Apt 4')
    expect(result.defaultAddress!.city).toBe('Springfield')
    expect(result.defaultAddress!.region).toBe('IL')
    expect(result.defaultAddress!.postalCode).toBe('62701')
    expect(result.defaultAddress!.country).toBe('US')
  })

  it('includes shipping addresses in the addresses array', () => {
    const shippingAddr = makeAddress({ Address: '456 Elm St', City: 'Chicago', State: 'IL', Zip: '60601' })
    const result = transformCustomer(makeCustomer({ ShippingAddressList: [shippingAddr] }))
    expect(result.addresses).toHaveLength(2)
    expect(result.addresses![1]!.line1).toBe('456 Elm St')
  })

  it('handles missing BillingAddress gracefully', () => {
    const result = transformCustomer(makeCustomer({ BillingAddress: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2023-06-15T08:30:00.000Z')
    expect(result.updatedAt).toBe('2024-04-10T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid result for minimal customer data', () => {
    const result = transformCustomer({
      CustomerID: 1,
      EMail: 'min@example.com',
    })
    expect(() => CustomerSchema.parse(result)).not.toThrow()
    expect(result.email).toBe('min@example.com')
  })
})
