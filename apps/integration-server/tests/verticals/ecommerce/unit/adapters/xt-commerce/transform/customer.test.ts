import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawWooCommerceCustomer> = {},
): RawWooCommerceCustomer {
  return {
    id: 42,
    email: 'jane.doe@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    username: 'janedoe',
    role: 'customer',
    billing: {
      address_1: '123 Main St',
      address_2: 'Suite 200',
      city: 'New York',
      state: 'NY',
      postcode: '10001',
      country: 'US',
      phone: '+12125550100',
      email: 'jane.doe@example.com',
    },
    shipping: {
      address_1: '456 Oak Ave',
      city: 'Brooklyn',
      state: 'NY',
      postcode: '11201',
      country: 'US',
    },
    orders_count: 5,
    total_spent: '299.95',
    date_created_gmt: '2024-01-01T00:00:00Z',
    date_modified_gmt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (xt-commerce)', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('maps first_name and last_name', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps phone from billing.phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+12125550100')
  })

  it('maps orders_count', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(5)
  })

  it('converts total_spent string to minor-unit money', () => {
    const result = transformCustomer(makeCustomer({ total_spent: '299.95' }))
    expect(result.totalSpent?.amount).toBe(29995)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('maps billing address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('123 Main St')
    expect(result.defaultAddress?.city).toBe('New York')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('maps both billing and shipping addresses into addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toBeDefined()
    // billing is first
    expect(result.addresses![0]!.line1).toBe('123 Main St')
    // shipping is second
    expect(result.addresses![1]!.line1).toBe('456 Oak Ave')
  })

  it('uses date_created_gmt for createdAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('uses date_modified_gmt for updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
  })

  it('returns undefined defaultAddress when billing is missing', () => {
    const result = transformCustomer(makeCustomer({ billing: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (xt-commerce)', () => {
  it('maps email, firstName, lastName', () => {
    const body = untransformCustomer({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Smith',
    })
    expect(body['email']).toBe('test@example.com')
    expect(body['first_name']).toBe('John')
    expect(body['last_name']).toBe('Smith')
  })

  it('maps defaultAddress to billing and shipping blocks', () => {
    const body = untransformCustomer({
      firstName: 'John',
      lastName: 'Smith',
      defaultAddress: {
        line1: '10 Downing St',
        city: 'London',
        country: 'GB',
      },
    })
    expect((body['billing'] as Record<string, unknown>)['address_1']).toBe('10 Downing St')
    expect((body['shipping'] as Record<string, unknown>)['address_1']).toBe('10 Downing St')
  })
})
