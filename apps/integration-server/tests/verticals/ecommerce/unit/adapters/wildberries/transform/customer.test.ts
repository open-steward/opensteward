import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 7,
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    username: 'alice',
    orders_count: 3,
    total_spent: '89.97',
    billing: {
      address_1: '42 Commerce Rd',
      city: 'Portland',
      state: 'OR',
      postcode: '97201',
      country: 'US',
      phone: '+15035550100',
    },
    shipping: {
      address_1: '42 Commerce Rd',
      city: 'Portland',
      state: 'OR',
      postcode: '97201',
      country: 'US',
    },
    date_created_gmt: '2024-01-15T08:00:00Z',
    date_modified_gmt: '2024-06-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Wildberries/WooCommerce)', () => {
  it('maps core identity fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
  })

  it('reads phone from billing sub-object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+15035550100')
  })

  it('converts total_spent from major to minor units with hardcoded USD', () => {
    const result = transformCustomer(makeCustomer())
    // 89.97 * 100 = 8997
    expect(result.totalSpent).toEqual({ amount: 8997, currency: 'USD' })
  })

  it('parses numeric total_spent correctly', () => {
    const result = transformCustomer(makeCustomer({ total_spent: 29.5 }))
    expect(result.totalSpent).toEqual({ amount: 2950, currency: 'USD' })
  })

  it('maps orders_count', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('maps billing address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: '42 Commerce Rd',
      city: 'Portland',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-15T08:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00Z')
  })

  it('omits totalSpent when total_spent is missing', () => {
    const result = transformCustomer(makeCustomer({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('omits defaultAddress when billing has no address fields', () => {
    const result = transformCustomer(
      makeCustomer({
        billing: { first_name: 'Alice' },
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })
})

describe('untransformCustomer (Wildberries/WooCommerce)', () => {
  it('maps name and email back to WC body', () => {
    const result = untransformCustomer({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
    })
    expect(result.email).toBe('alice@example.com')
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBe('Smith')
  })

  it('maps defaultAddress to billing and shipping sub-objects', () => {
    const result = untransformCustomer({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      phone: '+15035550100',
      defaultAddress: {
        line1: '42 Commerce Rd',
        city: 'Portland',
        postalCode: '97201',
        country: 'US',
      },
    })
    const billing = result.billing as Record<string, unknown>
    expect(billing['address_1']).toBe('42 Commerce Rd')
    expect(billing['phone']).toBe('+15035550100')
    const shipping = result.shipping as Record<string, unknown>
    expect(shipping['address_1']).toBe('42 Commerce Rd')
  })
})
