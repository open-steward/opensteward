import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawJtlShopCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer (jtl-shop)', () => {
  const raw: RawJtlShopCustomer = {
    id: 42,
    email: 'hans.mueller@example.de',
    firstName: 'Hans',
    lastName: 'Müller',
    phone: '+4930123456',
    acceptsMarketing: false,
    ordersCount: 7,
    totalSpent: 349.5,
    currency: 'EUR',
    tags: ['wholesale', 'preferred'],
    billingAddress: {
      street: 'Hauptstraße',
      streetNumber: '12',
      city: 'Berlin',
      state: 'Berlin',
      zip: '10115',
      countryCode: 'DE',
    },
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformCustomer(raw)
    expect(result.id).toBe('42')
  })

  it('maps email', () => {
    const result = transformCustomer(raw)
    expect(result.email).toBe('hans.mueller@example.de')
  })

  it('maps firstName and lastName', () => {
    const result = transformCustomer(raw)
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Müller')
  })

  it('converts totalSpent to minor units (EUR × 100)', () => {
    const result = transformCustomer(raw)
    // 349.50 EUR → 34950 cents
    expect(result.totalSpent).toEqual({ amount: 34950, currency: 'EUR' })
  })

  it('maps tags from array', () => {
    const result = transformCustomer(raw)
    expect(result.tags).toEqual(['wholesale', 'preferred'])
  })

  it('maps defaultAddress from billingAddress, joining street + number', () => {
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.line1).toBe('Hauptstraße 12')
    expect(result.defaultAddress?.city).toBe('Berlin')
    expect(result.defaultAddress?.country).toBe('DE')
  })

  it('maps createdAt from created', () => {
    const result = transformCustomer(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles null tags gracefully', () => {
    const result = transformCustomer({ ...raw, tags: null })
    expect(result.tags).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const result = transformCustomer(raw)
    const back = untransformCustomer(result)
    expect(back.email).toBe(raw.email)
    expect(back.firstName).toBe(raw.firstName)
    expect(back.tags).toEqual(['wholesale', 'preferred'])
  })
})
