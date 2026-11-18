import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawRevelCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawRevelCustomer> = {}): RawRevelCustomer {
  return {
    id: 200,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone_number: '503-555-9876',
    address: '456 Oak Ave',
    city: 'Portland',
    state: 'OR',
    zipcode: '97202',
    country: 'US',
    opt_in: true,
    created_date: '2024-01-15T10:00:00Z',
    updated_date: '2024-03-20T14:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Revel)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('200')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('503-555-9876')
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '456 Oak Ave',
      city: 'Portland',
      region: 'OR',
      postalCode: '97202',
      country: 'US',
    })
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2024-03-20T14:30:00Z')
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

  it('handles missing optional fields', () => {
    const minimal: RawRevelCustomer = { id: 999 }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('999')
    expect(result.email).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Revel)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['first_name']).toBe('Jane')
    expect(raw['last_name']).toBe('Doe')
    expect(raw['email']).toBe('jane@example.com')
    expect(raw['phone_number']).toBe('503-555-9876')
    expect(raw['opt_in']).toBe(true)
  })

  it('maps address fields back', () => {
    const raw = untransformCustomer({
      defaultAddress: { line1: '789 Pine', city: 'Seattle', region: 'WA' },
    })
    expect(raw['address']).toBe('789 Pine')
    expect(raw['city']).toBe('Seattle')
    expect(raw['state']).toBe('WA')
  })
})
