import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSapoCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSapoCustomer> = {}): RawSapoCustomer {
  return {
    id: 7001,
    email: 'nguyen@example.vn',
    first_name: 'Nguyen',
    last_name: 'Van A',
    phone: '+84 90 123 4567',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '500000',
    currency: 'VND',
    tags: 'vip, khach-hang-than-thiet',
    default_address: {
      address1: '123 Đường Lê Lợi',
      city: 'Hồ Chí Minh',
      zip: '700000',
      country: 'Vietnam',
      country_code: 'VN',
      province: 'Hồ Chí Minh',
    },
    addresses: [
      {
        address1: '123 Đường Lê Lợi',
        city: 'Hồ Chí Minh',
        zip: '700000',
        country_code: 'VN',
      },
    ],
    created_on: '2023-01-15T09:00:00Z',
    modified_on: '2024-03-20T14:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Sapo)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('nguyen@example.vn')
    expect(result.firstName).toBe('Nguyen')
    expect(result.lastName).toBe('Van A')
    expect(result.ordersCount).toBe(3)
  })

  it('converts VND total_spent with no scaling (VND is a zero-exponent currency)', () => {
    // VND has 0 minor-unit exponent: majorToMinor(500000, 'VND') === 500000
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 500000, currency: 'VND' })
  })

  it('defaults currency to VND when not provided', () => {
    const result = transformCustomer(makeCustomer({ currency: undefined, total_spent: '1000' }))
    expect(result.totalSpent?.currency).toBe('VND')
  })

  it('uses created_on → createdAt and modified_on → updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2023-01-15T09:00:00Z')
    expect(result.updatedAt).toBe('2024-03-20T14:30:00Z')
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'khach-hang-than-thiet'])
  })

  it('maps default_address using country_code preferentially', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('123 Đường Lê Lợi')
    expect(result.defaultAddress?.city).toBe('Hồ Chí Minh')
    expect(result.defaultAddress?.country).toBe('VN')
    expect(result.defaultAddress?.postalCode).toBe('700000')
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.line1).toBe('123 Đường Lê Lợi')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.email).toBe('nguyen@example.vn')
    expect(raw.first_name).toBe('Nguyen')
    expect(raw.last_name).toBe('Van A')
    expect(raw.tags).toBe('vip, khach-hang-than-thiet')
  })
})
