import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawStayAiCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/stay-ai/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawStayAiCustomer> = {}): RawStayAiCustomer {
  return {
    id: 42,
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+14155550101',
    activeSubscriptions: 3,
    defaultAddress: {
      address1: '1 Computing Lane',
      address2: 'Apt 2',
      city: 'London',
      province: 'Greater London',
      provinceCode: 'GL',
      zip: 'EC1A 1BB',
      country: 'United Kingdom',
      countryCode: 'GB',
      phone: '+14155550101',
    },
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core identity fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+14155550101')
  })

  it('maps activeSubscriptions to ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('maps defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Computing Lane')
    expect(result.defaultAddress?.line2).toBe('Apt 2')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.region).toBe('Greater London')
  })

  it('maps ISO string timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
  })

  it('maps epoch-ms number timestamps', () => {
    // toIso handles both ISO strings and epoch-ms numbers
    const epochMs = 1705315200000 // 2024-01-15T08:00:00.000Z
    const result = transformCustomer(makeCustomer({ createdAt: epochMs }))
    expect(result.createdAt).toBe(new Date(epochMs).toISOString())
  })

  it('returns undefined timestamps for null values', () => {
    const result = transformCustomer(makeCustomer({ createdAt: null, updatedAt: null }))
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('returns undefined ordersCount when not a number', () => {
    const result = transformCustomer(makeCustomer({ activeSubscriptions: null }))
    expect(result.ordersCount).toBeUndefined()
  })

  it('returns undefined defaultAddress when address is null', () => {
    const result = transformCustomer(makeCustomer({ defaultAddress: null }))
    expect(result.defaultAddress).toBeUndefined()
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

  it('handles null/undefined optional fields gracefully', () => {
    const result = transformCustomer({
      id: 99,
      email: null,
      firstName: null,
      phone: null,
    })
    expect(result.id).toBe('99')
    expect(result.email).toBeUndefined()
    expect(result.firstName).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
