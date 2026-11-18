import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawFabricCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawFabricCustomer> = {}): RawFabricCustomer {
  return {
    id: 'cust-001',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '+1-555-0100',
    accepts_marketing: true,
    orders_count: 5,
    total_spent: 499.95,
    total_spent_currency: 'USD',
    tags: ['vip', 'repeat'],
    default_address: {
      line1: '456 Main St',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'US',
    },
    addresses: [
      {
        line1: '456 Main St',
        city: 'Portland',
        state: 'OR',
        postal_code: '97201',
        country: 'US',
      },
    ],
    created_at: '2024-02-01T08:00:00Z',
    updated_at: '2024-07-10T15:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (fabric)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+1-555-0100')
    expect(result.acceptsMarketing).toBe(true)
    expect(result.ordersCount).toBe(5)
  })

  it('maps totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 49995, currency: 'USD' })
  })

  it('maps default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '456 Main St',
      line2: undefined,
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('handles missing totalSpent', () => {
    const result = transformCustomer(makeCustomer({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (fabric)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical) as Record<string, unknown>
    expect(body['first_name']).toBe('Jane')
    expect(body['last_name']).toBe('Doe')
    expect(body['email']).toBe('jane@example.com')
    expect(body['phone']).toBe('+1-555-0100')
    expect(body['accepts_marketing']).toBe(true)
    expect(body['tags']).toEqual(['vip', 'repeat'])
  })
})
