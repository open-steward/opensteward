import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 101,
    email: 'buyer@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    orders_count: 3,
    total_spent: '150.00',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-06-01T00:00:00Z',
    billing: {
      first_name: 'Alice',
      last_name: 'Smith',
      address_1: '123 Main St',
      address_2: 'Apt 4B',
      city: 'Springfield',
      state: 'IL',
      postcode: '62701',
      country: 'US',
      email: 'buyer@example.com',
      phone: '+1-555-0100',
    },
    ...overrides,
  }
}

describe('transformCustomer (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformCustomer(makeCustomer({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('buyer@example.com')
  })

  it('maps first and last name', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
  })

  it('maps phone from billing.phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps orders_count', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('converts total_spent string to minor-unit Money (USD default)', () => {
    const result = transformCustomer(makeCustomer({ total_spent: '150.00' }))
    expect(result.totalSpent?.amount).toBe(15000)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
  })

  it('maps billing address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('123 Main St')
    expect(result.defaultAddress?.city).toBe('Springfield')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('stores raw in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined totalSpent when total_spent is missing', () => {
    const result = transformCustomer(makeCustomer({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Ankorstore / WooCommerce)', () => {
  it('maps email, firstName, lastName', () => {
    const body = untransformCustomer({ email: 'a@b.com', firstName: 'Bob', lastName: 'Jones' })
    expect(body.email).toBe('a@b.com')
    expect(body.first_name).toBe('Bob')
    expect(body.last_name).toBe('Jones')
  })

  it('maps defaultAddress to billing and shipping', () => {
    const body = untransformCustomer({
      firstName: 'Alice',
      email: 'a@b.com',
      defaultAddress: { line1: '1 Road', city: 'Town', country: 'US' },
    })
    expect((body.billing as Record<string, unknown>).address_1).toBe('1 Road')
    expect((body.shipping as Record<string, unknown>).address_1).toBe('1 Road')
  })
})
