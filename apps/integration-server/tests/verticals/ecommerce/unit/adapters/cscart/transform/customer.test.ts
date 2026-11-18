import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type CsCartUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/cscart/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<CsCartUser> = {}): CsCartUser {
  return {
    user_id: 7,
    email: 'jane@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    phone: '+1 555 200 3000',
    status: 'A',
    b_address: '789 Oak St',
    b_address_2: 'Suite 2',
    b_city: 'Austin',
    b_state: 'TX',
    b_zipcode: '78701',
    b_country: 'US',
    s_address: '10 Elm Ave',
    s_city: 'Houston',
    s_state: 'TX',
    s_zipcode: '77001',
    s_country: 'US',
    orders_count: 3,
    purchase_value: '149.97',
    timestamp: 1700000000,
    last_login: 1704067200,
    ...overrides,
  }
}

describe('transformCustomer (CS-Cart)', () => {
  it('maps core fields and stringifies user_id', () => {
    const result = transformCustomer(makeUser())
    expect(result.id).toBe('7')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+1 555 200 3000')
  })

  it('maps orders_count and purchase_value', () => {
    const result = transformCustomer(makeUser())
    expect(result.ordersCount).toBe(3)
    expect(result.totalSpent).toEqual({ amount: 14997, currency: 'USD' })
  })

  it('maps purchase_value as number without change', () => {
    const result = transformCustomer(makeUser({ purchase_value: 200.0 }))
    expect(result.totalSpent).toEqual({ amount: 20000, currency: 'USD' })
  })

  it('handles null/missing purchase_value gracefully', () => {
    expect(transformCustomer(makeUser({ purchase_value: null })).totalSpent).toBeUndefined()
    expect(transformCustomer(makeUser({ purchase_value: undefined })).totalSpent).toBeUndefined()
  })

  it('maps billing address as defaultAddress', () => {
    const result = transformCustomer(makeUser())
    expect(result.defaultAddress).toMatchObject({
      line1: '789 Oak St',
      line2: 'Suite 2',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    })
  })

  it('includes both billing and shipping in addresses array', () => {
    const result = transformCustomer(makeUser())
    expect(result.addresses).toHaveLength(2)
    expect(result.addresses![0]!.city).toBe('Austin')
    expect(result.addresses![1]!.city).toBe('Houston')
  })

  it('omits address fields when all blank', () => {
    const noAddr = makeUser({
      b_address: null,
      b_city: null,
      b_zipcode: null,
      b_country: null,
      s_address: null,
      s_city: null,
      s_zipcode: null,
      s_country: null,
    })
    const result = transformCustomer(noAddr)
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('converts Unix timestamps to ISO strings', () => {
    const result = transformCustomer(makeUser())
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
    expect(result.updatedAt).toBe(new Date(1704067200 * 1000).toISOString())
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeUser()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeUser())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips core fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeUser())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('jane@example.com')
    expect(body['firstname']).toBe('Jane')
    expect(body['lastname']).toBe('Doe')
    expect(body['phone']).toBe('+1 555 200 3000')
  })

  it('untransformCustomer maps defaultAddress to billing and shipping fields', () => {
    const canonical = transformCustomer(makeUser())
    const body = untransformCustomer(canonical)
    expect(body['b_address']).toBe('789 Oak St')
    expect(body['b_city']).toBe('Austin')
    expect(body['b_country']).toBe('US')
    expect(body['s_address']).toBe('789 Oak St')
    expect(body['s_country']).toBe('US')
  })

  it('handles string orders_count correctly', () => {
    const result = transformCustomer(makeUser({ orders_count: '5' as unknown as number }))
    expect(result.ordersCount).toBe(5)
  })
})
