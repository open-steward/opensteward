import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawIkasCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawIkasCustomer> = {}): RawIkasCustomer {
  return {
    id: 'cust-abc',
    email: 'zeynep@example.com',
    firstName: 'Zeynep',
    lastName: 'Yılmaz',
    phone: '+905551234567',
    orderCount: 3,
    totalOrderPrice: 250.0,
    subscriptionStatus: 'SUBSCRIBED',
    addresses: [
      {
        addressLine1: 'Bağdat Caddesi No:1',
        addressLine2: 'Daire 5',
        city: { name: 'İstanbul' },
        state: { name: 'İstanbul' },
        country: { name: 'Turkey', iso2: 'TR', code: 'TR' },
        postalCode: '34710',
        isDefault: true,
      },
    ],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (ikas)', () => {
  it('maps id, email, firstName, lastName, phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-abc')
    expect(result.email).toBe('zeynep@example.com')
    expect(result.firstName).toBe('Zeynep')
    expect(result.lastName).toBe('Yılmaz')
    expect(result.phone).toBe('+905551234567')
  })

  it('maps acceptsMarketing from subscriptionStatus SUBSCRIBED', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps acceptsMarketing=false for UNSUBSCRIBED', () => {
    const result = transformCustomer(makeCustomer({ subscriptionStatus: 'UNSUBSCRIBED' }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps ordersCount and totalSpent in minor units (TRY)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
    // 250.00 TRY → 25000 minor units (TRY has 2 decimal places)
    expect(result.totalSpent).toEqual({ amount: 25000, currency: 'TRY' })
  })

  it('omits totalSpent when null', () => {
    const result = transformCustomer(makeCustomer({ totalOrderPrice: null }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('picks isDefault address as defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Bağdat Caddesi No:1')
    expect(result.defaultAddress?.line2).toBe('Daire 5')
    expect(result.defaultAddress?.city).toBe('İstanbul')
    expect(result.defaultAddress?.postalCode).toBe('34710')
    expect(result.defaultAddress?.country).toBe('TR')
  })

  it('falls back to first address when none is default', () => {
    const result = transformCustomer(
      makeCustomer({
        addresses: [
          {
            addressLine1: 'Istiklal Cad. 10',
            city: { name: 'Beyoğlu' },
            country: { iso2: 'TR' },
            isDefault: false,
          },
        ],
      }),
    )
    expect(result.defaultAddress?.line1).toBe('Istiklal Cad. 10')
  })

  it('returns no defaultAddress when address is empty', () => {
    const result = transformCustomer(makeCustomer({ addresses: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('ignores addresses with no meaningful fields', () => {
    const result = transformCustomer(
      makeCustomer({
        addresses: [{ addressLine1: null, city: null, postalCode: null, country: null }],
      }),
    )
    expect(result.addresses).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('zeynep@example.com')
    expect(body['firstName']).toBe('Zeynep')
    expect(body['subscriptionStatus']).toBe('SUBSCRIBED')
  })
})
