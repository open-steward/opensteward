import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawMedusaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawMedusaCustomer> = {}): RawMedusaCustomer {
  return {
    id: 'cus_01',
    email: 'ada@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone: '+1 555 000 1111',
    has_account: true,
    orders: [{ id: 'order_01' }, { id: 'order_02' }],
    addresses: [
      {
        id: 'addr_01',
        address_1: '1 Programming Ln',
        city: 'London',
        province: 'England',
        postal_code: 'NW1 2AB',
        country_code: 'GB',
      },
    ],
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Medusa v2)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cus_01')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.ordersCount).toBe(2)
  })

  it('maps addresses and default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '1 Programming Ln',
      city: 'London',
      region: 'England',
      postalCode: 'NW1 2AB',
      country: 'GB',
    })
    expect(result.addresses).toHaveLength(1)
  })

  it('handles customer without addresses', () => {
    const result = transformCustomer(makeCustomer({ addresses: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('ada@example.com')
    expect(body['first_name']).toBe('Ada')
    expect(body['last_name']).toBe('Lovelace')
    expect(body['phone']).toBe('+1 555 000 1111')
  })
})
