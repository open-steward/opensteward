import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCartpandaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/cartpanda/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCartpandaCustomer> = {}): RawCartpandaCustomer {
  return {
    id: 42,
    email: 'customer@example.com',
    first_name: 'Ana',
    last_name: 'Silva',
    phone: '+5511999999999',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '150.00',
    currency: 'BRL',
    tags: 'vip, repeat',
    default_address: {
      address1: 'Rua das Flores, 100',
      city: 'São Paulo',
      zip: '01310-000',
      country_code: 'BR',
    },
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
  })

  it('maps email, firstName, lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('customer@example.com')
    expect(result.firstName).toBe('Ana')
    expect(result.lastName).toBe('Silva')
  })

  it('converts total_spent to minor units using BRL currency', () => {
    // BRL uses 2 decimal places → 150.00 BRL = 15000 minor units
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 15000, currency: 'BRL' })
  })

  it('defaults currency to BRL when not provided', () => {
    const result = transformCustomer(makeCustomer({ currency: undefined }))
    expect(result.totalSpent?.currency).toBe('BRL')
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'repeat'])
  })

  it('maps default_address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.city).toBe('São Paulo')
    expect(result.defaultAddress?.country).toBe('BR')
    expect(result.defaultAddress?.postalCode).toBe('01310-000')
  })

  it('returns undefined address when no address fields are set', () => {
    const result = transformCustomer(makeCustomer({ default_address: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('sets metadata to the raw input', () => {
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
    expect(raw.email).toBe('customer@example.com')
    expect(raw.first_name).toBe('Ana')
    expect(raw.last_name).toBe('Silva')
  })

  it('serializes tags with ", " separator in untransform', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.tags).toBe('vip, repeat')
  })
})
