import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 55001,
    email: 'shopper@example.com',
    first_name: 'Alice',
    last_name: 'Chandra',
    phone: '+12025550001',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '149.99',
    currency: 'USD',
    tags: 'vip, loyal',
    default_address: {
      address1: '10 Main St',
      address2: 'Apt 2',
      city: 'Austin',
      province: 'Texas',
      province_code: 'TX',
      zip: '78701',
      country: 'United States',
      country_code: 'US',
    },
    created_at: '2023-06-01T00:00:00.000Z',
    updated_at: '2024-01-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('shopaccino transformCustomer', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('55001')
  })

  it('maps email and name fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('shopper@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Chandra')
  })

  it('converts total_spent string to minor units (USD: ×100)', () => {
    const result = transformCustomer(makeRaw())
    // 149.99 USD = 14999 cents
    expect(result.totalSpent?.amount).toBe(14999)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(makeRaw())
    expect(result.tags).toEqual(['vip', 'loyal'])
  })

  it('maps default address fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.line1).toBe('10 Main St')
    expect(result.defaultAddress?.line2).toBe('Apt 2')
    expect(result.defaultAddress?.city).toBe('Austin')
    expect(result.defaultAddress?.postalCode).toBe('78701')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('produces output that passes CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeRaw())
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('shopper@example.com')
    expect(back.first_name).toBe('Alice')
    expect(back.last_name).toBe('Chandra')
    // tags joined with ', ' on Shopify-style untransform
    expect(back.tags).toBe('vip, loyal')
  })
})
