import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawWooCommerceCustomer> = {},
): RawWooCommerceCustomer {
  return {
    id: 42,
    email: 'user@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    billing: {
      address_1: '123 Main',
      city: 'Boston',
      country: 'US',
      phone: '+16175550100',
    },
    orders_count: 3,
    total_spent: '99.99',
    ...overrides,
  }
}

describe('transformCustomer (wbuy)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('user@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.ordersCount).toBe(3)
    expect(result.totalSpent).toEqual({ amount: 9999, currency: 'USD' })
  })

  it('reads phone from billing.phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+16175550100')
  })

  it('maps billing address as the default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('123 Main')
    expect(result.defaultAddress?.city).toBe('Boston')
    expect(result.defaultAddress?.country).toBe('US')
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
    expect(body['email']).toBe('user@example.com')
    expect(body['first_name']).toBe('Jane')
    expect(body['last_name']).toBe('Doe')
    const billing = body['billing'] as { address_1?: string; country?: string }
    expect(billing.address_1).toBe('123 Main')
    expect(billing.country).toBe('US')
  })
})
