import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawLoyverseCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawLoyverseCustomer> = {}): RawLoyverseCustomer {
  return {
    id: 'cus_001',
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone_number: '+14155550123',
    address: '123 Main St',
    city: 'San Francisco',
    region: 'CA',
    postal_code: '94105',
    country_code: 'US',
    total_spent: 149.99,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Loyverse)', () => {
  it('maps id, email, and phone', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('cus_001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.phone).toBe('+14155550123')
  })

  it('splits name on first space into firstName and lastName', () => {
    const result = transformCustomer(makeRaw())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('handles single-word name (no last name)', () => {
    const result = transformCustomer(makeRaw({ name: 'Madonna' }))
    expect(result.firstName).toBe('Madonna')
    expect(result.lastName).toBeUndefined()
  })

  it('handles null name', () => {
    const result = transformCustomer(makeRaw({ name: null }))
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('handles multi-word last name (splits only on first space)', () => {
    const result = transformCustomer(makeRaw({ name: 'Mary Jane Watson' }))
    expect(result.firstName).toBe('Mary')
    expect(result.lastName).toBe('Jane Watson')
  })

  it('converts total_spent from major to minor units with USD currency', () => {
    const result = transformCustomer(makeRaw({ total_spent: 149.99 }))
    expect(result.totalSpent).toEqual({ amount: 14999, currency: 'USD' })
  })

  it('omits totalSpent when null', () => {
    const result = transformCustomer(makeRaw({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('maps defaultAddress from flat fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress).toEqual({
      line1: '123 Main St',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94105',
      country: 'US',
    })
  })

  it('sets addresses array to same address as defaultAddress', () => {
    const result = transformCustomer(makeRaw())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]).toEqual(result.defaultAddress)
  })

  it('omits address when all address fields are absent', () => {
    const result = transformCustomer(
      makeRaw({ address: null, city: null, postal_code: null, country_code: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2024-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2024-02-01T14:20:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const result = transformCustomer(makeRaw({ email: undefined, name: null }))
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Loyverse)', () => {
  it('joins firstName and lastName into name', () => {
    const result = untransformCustomer({ firstName: 'Jane', lastName: 'Doe' })
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email and phone_number', () => {
    const result = untransformCustomer({ email: 'jane@example.com', phone: '+14155550123' })
    expect(result.email).toBe('jane@example.com')
    expect(result.phone_number).toBe('+14155550123')
  })

  it('maps defaultAddress fields', () => {
    const result = untransformCustomer({
      defaultAddress: {
        line1: '123 Main St',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94105',
        country: 'US',
      },
    })
    expect(result.address).toBe('123 Main St')
    expect(result.city).toBe('San Francisco')
    expect(result.region).toBe('CA')
    expect(result.postal_code).toBe('94105')
    expect(result.country_code).toBe('US')
  })
})
