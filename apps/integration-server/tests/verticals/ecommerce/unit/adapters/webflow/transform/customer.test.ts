import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWebflowCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWebflowCustomer> = {}): RawWebflowCustomer {
  return {
    _id: 'cust_001',
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    phone: '+1 555 000 1111',
    acceptsMarketing: true,
    ordersCount: 5,
    totalSpent: 500,
    currency: 'USD',
    billingAddress: {
      line1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country: 'GB',
    },
    createdOn: '2024-01-10T12:00:00Z',
    lastUpdated: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust_001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.acceptsMarketing).toBe(true)
    expect(result.ordersCount).toBe(5)
  })

  it('maps total spent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.postalCode).toBe('NW1 2AB')
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
    expect(raw.email).toBe('ada@example.com')
    expect(raw.name).toBe('Ada Lovelace')
  })
})
