import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 3001,
    email: 'client@fnac.fr',
    first_name: 'Marie',
    last_name: 'Dupont',
    orders_count: 7,
    total_spent: '349.93',
    billing: {
      address_1: '15 Rue du Commerce',
      city: 'Lyon',
      postcode: '69002',
      country: 'FR',
      phone: '+33-4-0000-0001',
    },
    shipping: {
      address_1: '15 Rue du Commerce',
      city: 'Lyon',
      postcode: '69002',
      country: 'FR',
    },
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (FNAC/WooCommerce)', () => {
  it('maps id, email, firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('3001')
    expect(result.email).toBe('client@fnac.fr')
    expect(result.firstName).toBe('Marie')
    expect(result.lastName).toBe('Dupont')
  })

  it('maps phone from billing.phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+33-4-0000-0001')
  })

  it('maps ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(7)
  })

  it('converts total_spent to minor units (USD hardcoded)', () => {
    const result = transformCustomer(makeCustomer({ total_spent: '349.93' }))
    expect(result.totalSpent).toEqual({ amount: 34993, currency: 'USD' })
  })

  it('maps defaultAddress from billing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress!.line1).toBe('15 Rue du Commerce')
    expect(result.defaultAddress!.city).toBe('Lyon')
    expect(result.defaultAddress!.country).toBe('FR')
  })

  it('maps createdAt and updatedAt from GMT fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('round-trips via untransformCustomer', () => {
    const result = transformCustomer(makeCustomer())
    const body = untransformCustomer(result)
    expect(body.email).toBe('client@fnac.fr')
    expect(body.first_name).toBe('Marie')
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
