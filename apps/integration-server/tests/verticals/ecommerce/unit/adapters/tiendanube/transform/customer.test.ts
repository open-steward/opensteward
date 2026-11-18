import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawTiendanubeCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawTiendanubeCustomer> = {}): RawTiendanubeCustomer {
  return {
    id: 77,
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+14155550123',
    accepts_marketing: true,
    total_spent: '250.00',
    total_spent_currency: 'USD',
    default_address: {
      address: '123 Main St',
      number: '4B',
      city: 'New York',
      province: 'NY',
      zipcode: '10001',
      country: 'US',
    },
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (Tiendanube)', () => {
  it('maps id, email, and phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('77')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
  })

  it('splits single name field into firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('handles single-word name (no lastName)', () => {
    const result = transformCustomer(makeCustomer({ name: 'Madonna' }))
    expect(result.firstName).toBe('Madonna')
    expect(result.lastName).toBeUndefined()
  })

  it('converts total_spent from major-unit string to minor units', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 25000, currency: 'USD' })
  })

  it('maps acceptsMarketing', () => {
    expect(transformCustomer(makeCustomer({ accepts_marketing: true })).acceptsMarketing).toBe(true)
    expect(transformCustomer(makeCustomer({ accepts_marketing: false })).acceptsMarketing).toBe(
      false,
    )
  })

  it('maps default address with street+number concatenated', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('123 Main St 4B')
    expect(result.defaultAddress!.city).toBe('New York')
    expect(result.defaultAddress!.region).toBe('NY')
    expect(result.defaultAddress!.postalCode).toBe('10001')
    expect(result.defaultAddress!.country).toBe('US')
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
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

  it('round-trips core fields via untransformCustomer', () => {
    const customer = transformCustomer(makeCustomer())
    const body = untransformCustomer(customer)
    expect(body['name']).toBe('Jane Doe')
    expect(body['email']).toBe('jane@example.com')
    expect(body['phone']).toBe('+14155550123')
  })
})
