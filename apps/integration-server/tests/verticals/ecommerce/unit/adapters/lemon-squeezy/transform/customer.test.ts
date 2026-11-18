import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawLsCustomer,
  type RawLsCustomerAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeAttrs(overrides: Partial<RawLsCustomerAttributes> = {}): RawLsCustomerAttributes {
  return {
    store_id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    status: 'subscribed',
    city: 'San Francisco',
    region: 'California',
    country: 'US',
    total_revenue_currency: 14997,
    mrr: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeRaw(attrsOverrides: Partial<RawLsCustomerAttributes> = {}): RawLsCustomer {
  return {
    id: 'cus-42',
    type: 'customers',
    attributes: makeAttrs(attrsOverrides),
  }
}

describe('transformCustomer (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('cus-42')
  })

  it('maps email from attributes', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('jane@example.com')
  })

  it('splits full name into firstName and lastName', () => {
    const result = transformCustomer(makeRaw({ name: 'Jane Doe' }))
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('handles single-word name as firstName only', () => {
    const result = transformCustomer(makeRaw({ name: 'Madonna' }))
    expect(result.firstName).toBe('Madonna')
    expect(result.lastName).toBeUndefined()
  })

  it('maps total_revenue_currency (already cents) to totalSpent.amount', () => {
    const result = transformCustomer(makeRaw({ total_revenue_currency: 14997 }))
    expect(result.totalSpent?.amount).toBe(14997)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('builds defaultAddress from city, region, country', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.city).toBe('San Francisco')
    expect(result.defaultAddress?.region).toBe('California')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('sets defaultAddress to undefined when all fields absent', () => {
    const result = transformCustomer(makeRaw({ city: null, region: null, country: '' }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps created_at to createdAt', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformCustomer(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores id and type in metadata', () => {
    const result = transformCustomer(makeRaw())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('cus-42')
    expect(meta.type).toBe('customers')
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (lemon-squeezy)', () => {
  it('reconstructs full name from firstName and lastName', () => {
    const body = untransformCustomer({ firstName: 'Jane', lastName: 'Doe' })
    expect(body.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const body = untransformCustomer({ email: 'test@example.com' })
    expect(body.email).toBe('test@example.com')
  })

  it('round-trips name and email', () => {
    const canonical = transformCustomer(makeRaw())
    const body = untransformCustomer(canonical)
    expect(body.name).toBe('Jane Doe')
    expect(body.email).toBe('jane@example.com')
  })
})
