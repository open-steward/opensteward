import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shogun/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 42,
    email: 'jane.doe@acme.example',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+14155550123',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '149.97',
    currency: 'USD',
    tags: 'vip, wholesale',
    default_address: {
      address1: '123 Market St',
      address2: 'Suite 4',
      city: 'San Francisco',
      province: 'California',
      province_code: 'CA',
      zip: '94103',
      country: 'United States',
      country_code: 'US',
    },
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

// ── transformCustomer ─────────────────────────────────────────────────────────

describe('transformCustomer (Shogun)', () => {
  it('maps id as string', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps phone and acceptsMarketing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+14155550123')
    expect(result.acceptsMarketing).toBe(true)
  })

  it('converts total_spent to minor units', () => {
    const result = transformCustomer(makeCustomer())
    // 149.97 USD → 14997 cents
    expect(result.totalSpent).toEqual({ amount: 14997, currency: 'USD' })
  })

  it('splits tags by comma', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'wholesale'])
  })

  it('maps default_address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: '123 Market St',
      line2: 'Suite 4',
      city: 'San Francisco',
      postalCode: '94103',
      country: 'US',
    })
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('handles null email gracefully', () => {
    const result = transformCustomer(makeCustomer({ email: null }))
    expect(result.email).toBeUndefined()
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

// ── untransformCustomer ───────────────────────────────────────────────────────

describe('untransformCustomer (Shogun)', () => {
  it('maps email, firstName, lastName', () => {
    const body = untransformCustomer({ email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' })
    expect(body['email']).toBe('jane@example.com')
    expect(body['first_name']).toBe('Jane')
    expect(body['last_name']).toBe('Doe')
  })

  it('joins tags array into comma string', () => {
    const body = untransformCustomer({ tags: ['vip', 'wholesale'] })
    expect(body['tags']).toBe('vip, wholesale')
  })
})
