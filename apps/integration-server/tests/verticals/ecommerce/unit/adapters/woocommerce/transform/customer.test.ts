import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawWooCommerceCustomer> = {},
): RawWooCommerceCustomer {
  return {
    id: 7001,
    email: 'ada@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    username: 'ada',
    role: 'customer',
    billing: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Programming Ln',
      city: 'London',
      state: 'England',
      postcode: 'NW1 2AB',
      country: 'GB',
      email: 'ada@example.com',
      phone: '+1 555 000 1111',
    },
    shipping: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      address_1: '1 Programming Ln',
      city: 'London',
      state: 'England',
      postcode: 'NW1 2AB',
      country: 'GB',
    },
    is_paying_customer: true,
    orders_count: 4,
    total_spent: '420.50',
    date_created: '2023-01-01T00:00:00.000Z',
    date_created_gmt: '2023-01-01T00:00:00.000Z',
    date_modified: '2024-02-01T00:00:00.000Z',
    date_modified_gmt: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.ordersCount).toBe(4)
    expect(result.totalSpent).toEqual({ amount: 42050, currency: 'USD' })
  })

  it('maps billing address as the default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.addresses?.length).toBeGreaterThan(0)
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('ada@example.com')
    expect(body['first_name']).toBe('Ada')
    expect(body['last_name']).toBe('Lovelace')
    const billing = body['billing'] as { address_1?: string; country?: string }
    expect(billing.address_1).toBe('1 Programming Ln')
    expect(billing.country).toBe('GB')
  })
})
