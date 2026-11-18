import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoplineCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawShoplineCustomer> = {}): RawShoplineCustomer {
  return {
    id: 7001,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+14155550123',
    email_marketing_consent: { state: 'subscribed' },
    orders_count: 3,
    total_spent: '149.97',
    currency: 'USD',
    tags: 'vip, returning',
    default_address: {
      address1: '123 Main St',
      city: 'San Francisco',
      zip: '94102',
      country_code: 'US',
    },
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-06-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core string fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('7001')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+14155550123')
  })

  it('converts total_spent to minor units money object', () => {
    const result = transformCustomer(makeRaw())
    // 149.97 USD → 14997 cents
    expect(result.totalSpent).toEqual({ amount: 14997, currency: 'USD' })
  })

  it('resolves acceptsMarketing from email_marketing_consent.state', () => {
    const subscribed = transformCustomer(makeRaw())
    expect(subscribed.acceptsMarketing).toBe(true)

    const unsubscribed = transformCustomer(
      makeRaw({ email_marketing_consent: { state: 'unsubscribed' } }),
    )
    expect(unsubscribed.acceptsMarketing).toBe(false)
  })

  it('falls back to accepts_marketing boolean when consent object absent', () => {
    const result = transformCustomer(
      makeRaw({ email_marketing_consent: null, accepts_marketing: true }),
    )
    expect(result.acceptsMarketing).toBe(true)
  })

  it('splits comma-delimited tag string into array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.tags).toEqual(['vip', 'returning'])
  })

  it('passes through tag arrays unchanged', () => {
    const result = transformCustomer(makeRaw({ tags: ['wholesale'] }))
    expect(result.tags).toEqual(['wholesale'])
  })

  it('maps default_address fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.line1).toBe('123 Main St')
    expect(result.defaultAddress?.city).toBe('San Francisco')
    expect(result.defaultAddress?.postalCode).toBe('94102')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('maps ordersCount and timestamps', () => {
    const result = transformCustomer(makeRaw())
    expect(result.ordersCount).toBe(3)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeRaw())
    const body = untransformCustomer(canonical)
    expect(body.email).toBe('jane@example.com')
    expect(body.first_name).toBe('Jane')
    expect(body.last_name).toBe('Doe')
    // acceptsMarketing → email_marketing_consent
    expect((body.email_marketing_consent as Record<string, unknown>)?.state).toBe('subscribed')
  })
})
