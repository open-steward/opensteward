import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoplazzaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawShoplazzaCustomer> = {}): RawShoplazzaCustomer {
  return {
    id: 40001,
    email: 'buyer@example.com',
    first_name: 'Li',
    last_name: 'Wei',
    phone: '+8613800138000',
    accepts_marketing: true,
    orders_count: 7,
    total_spent: '399.50',
    currency: 'USD',
    tags: 'vip,repeat-buyer',
    default_address: {
      address1: '888 Commerce Road',
      address2: 'Floor 3',
      city: 'Shanghai',
      province: 'Shanghai',
      zip: '200001',
      country: 'China',
      country_code: 'CN',
    },
    created_at: '2022-08-01T00:00:00.000Z',
    updated_at: '2024-02-28T10:00:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformCustomer', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('40001')
  })

  it('maps first_name and last_name', () => {
    const result = transformCustomer(makeRaw())
    expect(result.firstName).toBe('Li')
    expect(result.lastName).toBe('Wei')
  })

  it('converts total_spent to minor units (USD: ×100)', () => {
    // 399.50 USD = 39950 cents
    const result = transformCustomer(makeRaw())
    expect(result.totalSpent?.amount).toBe(39950)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('splits comma-separated tags (Shoplazza has no space after comma)', () => {
    const result = transformCustomer(makeRaw())
    expect(result.tags).toEqual(['vip', 'repeat-buyer'])
  })

  it('maps default address with country_code → country', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.line1).toBe('888 Commerce Road')
    expect(result.defaultAddress?.line2).toBe('Floor 3')
    expect(result.defaultAddress?.city).toBe('Shanghai')
    expect(result.defaultAddress?.postalCode).toBe('200001')
    expect(result.defaultAddress?.country).toBe('CN')
  })

  it('produces output that passes CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer (tags joined without space)', () => {
    const canonical = transformCustomer(makeRaw())
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('buyer@example.com')
    // Shoplazza untransform joins tags with ',' (no space)
    expect(back.tags).toBe('vip,repeat-buyer')
  })
})
