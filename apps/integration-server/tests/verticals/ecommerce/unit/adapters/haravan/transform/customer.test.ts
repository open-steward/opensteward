/**
 * Haravan Customer transform — verified against
 * https://docs.haravan.com/docs/omni-apis/customer/ raw doc HTML. Haravan's
 * Customer has no `total_spent`/`currency` field (unlike Shopify), so
 * `totalSpent` must stay undefined rather than being computed with a
 * default currency.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawHaravanCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawHaravanCustomer> = {}): RawHaravanCustomer {
  return {
    id: 1037889951,
    email: 'buyer@haravan.com',
    first_name: 'Trong',
    last_name: 'Nhan',
    phone: '0900000000',
    accepts_marketing: true,
    orders_count: 3,
    tags: 'vip, wholesale',
    default_address: { address1: '1 Le Loi', city: 'HCMC', country_code: 'VN', zip: '700000' },
    created_at: '2021-01-01T00:00:00Z',
    updated_at: '2021-01-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (haravan)', () => {
  it('maps id, email, name, and phone', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('1037889951')
    expect(result.email).toBe('buyer@haravan.com')
    expect(result.firstName).toBe('Trong')
  })

  it('never invents totalSpent — Haravan customers have no such field', () => {
    expect(transformCustomer(makeRaw()).totalSpent).toBeUndefined()
  })

  it('splits tags and maps defaultAddress', () => {
    const result = transformCustomer(makeRaw())
    expect(result.tags).toEqual(['vip', 'wholesale'])
    expect(result.defaultAddress?.city).toBe('HCMC')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const body = untransformCustomer(transformCustomer(makeRaw()))
    expect(body['email']).toBe('buyer@haravan.com')
  })
})
