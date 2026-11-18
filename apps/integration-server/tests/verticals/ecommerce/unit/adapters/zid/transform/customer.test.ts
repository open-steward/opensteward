import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawZidCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawZidCustomer> = {}): RawZidCustomer {
  return {
    id: 7001,
    name: 'Ahmed Al-Rashid',
    email: 'ahmed@example.sa',
    mobile: '+966500000001',
    gender: 'male',
    verified: true,
    is_active: true,
    order_counts: 3,
    order_total_payments: '450.00',
    city: {
      name: 'Riyadh',
      en_name: 'Riyadh',
      country_code: 'SA',
      country_name: 'Saudi Arabia',
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('ahmed@example.sa')
  })

  it('splits full name into firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Ahmed')
    expect(result.lastName).toBe('Al-Rashid')
  })

  it('sets only firstName when name has single word', () => {
    const result = transformCustomer(makeCustomer({ name: 'Ahmed' }))
    expect(result.firstName).toBe('Ahmed')
    expect(result.lastName).toBeUndefined()
  })

  it('maps mobile to phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+966500000001')
  })

  it('maps order_counts to ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('converts order_total_payments major-unit SAR to minor units', () => {
    const result = transformCustomer(makeCustomer())
    // 450.00 SAR = 45000 halalas
    expect(result.totalSpent).toEqual({ amount: 45000, currency: 'SAR' })
  })

  it('maps city to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({ city: 'Riyadh', country: 'SA' })
  })

  it('prefers en_name over name for city', () => {
    const result = transformCustomer(
      makeCustomer({ city: { name: 'الرياض', en_name: 'Riyadh', country_code: 'SA' } }),
    )
    expect(result.defaultAddress?.city).toBe('Riyadh')
  })

  it('maps created_at and updated_at', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2026-01-15T09:30:00Z')
  })

  it('leaves acceptsMarketing undefined (not exposed by Zid)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Zid)', () => {
  it('joins firstName and lastName into name', () => {
    const body = untransformCustomer({ firstName: 'Ahmed', lastName: 'Al-Rashid' })
    expect(body.name).toBe('Ahmed Al-Rashid')
  })

  it('maps email', () => {
    const body = untransformCustomer({ email: 'ahmed@example.sa' })
    expect(body.email).toBe('ahmed@example.sa')
  })

  it('maps phone to mobile', () => {
    const body = untransformCustomer({ phone: '+966500000001' })
    expect(body.mobile).toBe('+966500000001')
  })
})
