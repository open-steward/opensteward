import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 1001,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+14155550101',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '149.97',
    currency: 'USD',
    tags: 'vip, loyal',
    default_address: {
      address1: '123 Main St',
      city: 'San Francisco',
      zip: '94105',
      country_code: 'US',
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeCustomer({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('jane@example.com')
  })

  it('converts total_spent string to minor units', () => {
    // 149.97 USD → 14997 cents
    const result = transformCustomer(makeCustomer({ total_spent: '149.97', currency: 'USD' }))
    expect(result.totalSpent?.amount).toBe(14997)
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(makeCustomer({ tags: 'vip, loyal' }))
    expect(result.tags).toEqual(['vip', 'loyal'])
  })

  it('maps default_address.zip to defaultAddress.postalCode', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.postalCode).toBe('94105')
  })

  it('maps accepts_marketing', () => {
    const result = transformCustomer(makeCustomer({ accepts_marketing: false }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('stores raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (logicommerce / Shopify)', () => {
  it('maps firstName to first_name', () => {
    const body = untransformCustomer({ firstName: 'Alice' })
    expect(body.first_name).toBe('Alice')
  })

  it('round-trips email and name', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body.email).toBe('jane@example.com')
    expect(body.first_name).toBe('Jane')
  })
})
