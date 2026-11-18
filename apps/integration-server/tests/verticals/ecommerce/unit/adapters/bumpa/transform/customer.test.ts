import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawBumpaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer (bumpa)', () => {
  const raw: RawBumpaCustomer = {
    id: 200,
    email: 'kemi@example.ng',
    first_name: 'Kemi',
    last_name: 'Adeyemi',
    phone: '+2348012345678',
    accepts_marketing: false,
    orders_count: 5,
    total_spent: '50000.00',
    currency: 'NGN',
    tags: 'regular,vip',
    default_address: {
      address1: '12 Broad Street',
      city: 'Lagos',
      state: 'Lagos',
      country: 'NG',
      postal_code: '100001',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformCustomer(raw).id).toBe('200')
  })

  it('maps email', () => {
    expect(transformCustomer(raw).email).toBe('kemi@example.ng')
  })

  it('maps first and last name from explicit fields', () => {
    const result = transformCustomer(raw)
    expect(result.firstName).toBe('Kemi')
    expect(result.lastName).toBe('Adeyemi')
  })

  it('converts total_spent to minor units (NGN)', () => {
    // NGN has no fractional digits (100 subunits) → 50000.00 NGN = 5000000 kobo
    const result = transformCustomer(raw)
    expect(result.totalSpent?.amount).toBe(5000000)
    expect(result.totalSpent?.currency).toBe('NGN')
  })

  it('splits comma-separated tags string', () => {
    expect(transformCustomer(raw).tags).toEqual(['regular', 'vip'])
  })

  it('accepts tags as array', () => {
    const result = transformCustomer({ ...raw, tags: ['a', 'b'] })
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('maps default address', () => {
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.line1).toBe('12 Broad Street')
    expect(result.defaultAddress?.city).toBe('Lagos')
    expect(result.defaultAddress?.country).toBe('NG')
    expect(result.defaultAddress?.postalCode).toBe('100001')
  })

  it('splits name field when first_name/last_name absent', () => {
    const result = transformCustomer({
      ...raw,
      first_name: null,
      last_name: null,
      name: 'Tunde Bakare',
    })
    expect(result.firstName).toBe('Tunde')
    expect(result.lastName).toBe('Bakare')
  })

  it('passes CustomerSchema validation', () => {
    expect(() => CustomerSchema.parse(transformCustomer(raw))).not.toThrow()
  })
})

describe('untransformCustomer (bumpa)', () => {
  it('round-trips email and phone', () => {
    const canonical = transformCustomer({
      id: 1,
      email: 'x@y.ng',
      phone: '+2348000000000',
    })
    const body = untransformCustomer(canonical)
    expect(body.email).toBe('x@y.ng')
    expect(body.phone).toBe('+2348000000000')
  })

  it('joins tags with comma', () => {
    const canonical = transformCustomer({ id: 2, tags: 'a, b, c' })
    const body = untransformCustomer(canonical)
    expect(body['tags']).toBe('a,b,c')
  })
})
