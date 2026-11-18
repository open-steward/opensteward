import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawVolusionCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawVolusionCustomer> = {}): RawVolusionCustomer {
  return {
    CustomerID: 3001,
    EmailAddress: 'jane@example.com',
    FirstName: 'Jane',
    LastName: 'Doe',
    PhoneNumber: '+1 555 123 4567',
    NewsletterSubscriber: true,
    TotalOrders: 7,
    TotalSpent: 890.5,
    BillingAddress: {
      Address1: '100 Main St',
      City: 'Austin',
      State: 'TX',
      PostalCode: '73301',
      Country: 'US',
    },
    ShippingAddress: {
      Address1: '200 Oak Ave',
      City: 'Austin',
      State: 'TX',
      PostalCode: '73301',
      Country: 'US',
    },
    DateCreated: '2023-06-15T00:00:00Z',
    LastModified: '2024-01-20T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.ordersCount).toBe(7)
    expect(result.totalSpent).toEqual({ amount: 89050, currency: 'USD' })
  })

  it('maps billing address as default and both addresses in array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('100 Main St')
    expect(result.defaultAddress?.country).toBe('US')
    expect(result.addresses).toHaveLength(2)
  })

  it('maps accepts marketing from newsletter subscriber', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('handles missing addresses', () => {
    const result = transformCustomer(
      makeCustomer({ BillingAddress: null, ShippingAddress: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
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

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.EmailAddress).toBe('jane@example.com')
    expect(raw.FirstName).toBe('Jane')
    expect(raw.LastName).toBe('Doe')
    expect(raw.NewsletterSubscriber).toBe(true)
  })
})
