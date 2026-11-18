import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 7,
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    orders_count: 3,
    total_spent: '150.00',
    billing: {
      first_name: 'Alice',
      last_name: 'Smith',
      address_1: '42 Oak Ave',
      city: 'Portland',
      state: 'OR',
      postcode: '97201',
      country: 'US',
      phone: '+15035550001',
    },
    date_created_gmt: '2024-01-10T08:00:00Z',
    date_modified_gmt: '2024-02-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Yampi/WooCommerce)', () => {
  it('maps core identity fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
  })

  it('maps phone from billing sub-object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+15035550001')
  })

  it('maps ordersCount and totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
    expect(result.totalSpent).toEqual({ amount: 15000, currency: 'USD' })
  })

  it('maps defaultAddress from billing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('42 Oak Ave')
    expect(result.defaultAddress?.city).toBe('Portland')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('omits defaultAddress when billing is empty', () => {
    const result = transformCustomer(makeCustomer({ billing: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-10T08:00:00Z')
    expect(result.updatedAt).toBe('2024-02-15T12:00:00Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('untransformCustomer (Yampi/WooCommerce)', () => {
  it('maps email and name fields back to WC', () => {
    const result = untransformCustomer({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
    })
    expect(result.email).toBe('alice@example.com')
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBe('Smith')
  })

  it('maps defaultAddress to billing and shipping', () => {
    const result = untransformCustomer({
      email: 'alice@example.com',
      firstName: 'Alice',
      defaultAddress: {
        line1: '42 Oak Ave',
        city: 'Portland',
        postalCode: '97201',
        country: 'US',
      },
    })
    expect((result.billing as Record<string, unknown>)['address_1']).toBe('42 Oak Ave')
    expect((result.shipping as Record<string, unknown>)['city']).toBe('Portland')
  })
})
