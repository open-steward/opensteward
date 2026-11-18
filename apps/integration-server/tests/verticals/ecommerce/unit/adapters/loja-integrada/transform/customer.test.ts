import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 6001,
    email: 'joao.silva@exemplo.com.br',
    first_name: 'João',
    last_name: 'Silva',
    phone: '+5521988880000',
    accepts_marketing: true,
    orders_count: 5,
    total_spent: '450.00',
    currency: 'BRL',
    tags: 'vip, fidelidade',
    default_address: {
      address1: 'Avenida Paulista, 1000',
      address2: 'Ap 42',
      city: 'São Paulo',
      province: 'São Paulo',
      province_code: 'SP',
      zip: '01311-100',
      country: 'Brasil',
      country_code: 'BR',
    },
    addresses: [
      {
        address1: 'Avenida Paulista, 1000',
        city: 'São Paulo',
        zip: '01311-100',
        country_code: 'BR',
      },
    ],
    created_at: '2023-06-10T09:00:00Z',
    updated_at: '2024-01-20T11:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (loja-integrada / Shopify)', () => {
  it('maps id, name, email, and phone', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('6001')
    expect(result.firstName).toBe('João')
    expect(result.lastName).toBe('Silva')
    expect(result.email).toBe('joao.silva@exemplo.com.br')
    expect(result.phone).toBe('+5521988880000')
  })

  it('maps marketing acceptance and order stats', () => {
    const result = transformCustomer(makeRaw())
    expect(result.acceptsMarketing).toBe(true)
    expect(result.ordersCount).toBe(5)
  })

  it('converts total_spent to minor units with correct currency', () => {
    const result = transformCustomer(makeRaw())
    // 450.00 BRL → 45000 cents
    expect(result.totalSpent).toEqual({ amount: 45000, currency: 'BRL' })
  })

  it('splits tags string into array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.tags).toEqual(['vip', 'fidelidade'])
  })

  it('maps default address, preferring country_code over country', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress).toMatchObject({
      line1: 'Avenida Paulista, 1000',
      line2: 'Ap 42',
      city: 'São Paulo',
      postalCode: '01311-100',
      country: 'BR',
      region: 'São Paulo',
    })
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.country).toBe('BR')
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2023-06-10T09:00:00Z')
    expect(result.updatedAt).toBe('2024-01-20T11:00:00Z')
  })

  it('handles null email/names gracefully', () => {
    const result = transformCustomer(makeRaw({ email: null, first_name: null, last_name: null }))
    expect(result.email).toBeUndefined()
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('returns undefined totalSpent when total_spent is absent', () => {
    const result = transformCustomer(makeRaw({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify keys', () => {
    const result = untransformCustomer({
      email: 'joao.silva@exemplo.com.br',
      firstName: 'João',
      lastName: 'Silva',
      phone: '+5521988880000',
      acceptsMarketing: true,
      tags: ['vip', 'fidelidade'],
    })
    expect(result.email).toBe('joao.silva@exemplo.com.br')
    expect(result.first_name).toBe('João')
    expect(result.last_name).toBe('Silva')
    expect(result.phone).toBe('+5521988880000')
    expect(result.accepts_marketing).toBe(true)
    expect(result.tags).toBe('vip, fidelidade')
  })
})
