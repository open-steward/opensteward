import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSallaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSallaCustomer> = {}): RawSallaCustomer {
  return {
    id: 3001,
    first_name: 'Fatima',
    last_name: 'Al-Rashid',
    mobile: 501234567,
    mobile_code: '+966',
    email: 'fatima@example.sa',
    city: 'Riyadh',
    country: 'Saudi Arabia',
    country_code: 'SA',
    location: 'King Fahd Road, Building 12',
    currency: 'SAR',
    updated_at: { date: '2024-03-15 10:30:00', timezone: 'Asia/Riyadh' },
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('fatima@example.sa')
    expect(result.firstName).toBe('Fatima')
    expect(result.lastName).toBe('Al-Rashid')
  })

  it('concatenates mobile_code and mobile into phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+966501234567')
  })

  it('maps address from city and country_code fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.city).toBe('Riyadh')
    expect(result.defaultAddress?.country).toBe('SA')
    expect(result.defaultAddress?.line1).toBe('King Fahd Road, Building 12')
  })

  it('omits defaultAddress when no geographic fields present', () => {
    const result = transformCustomer(
      makeCustomer({ city: null, country: null, country_code: null, location: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
  })

  it('handles string updated_at', () => {
    const result = transformCustomer(makeCustomer({ updated_at: '2024-04-01T00:00:00Z' }))
    expect(result.updatedAt).toBeDefined()
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

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.first_name).toBe('Fatima')
    expect(raw.last_name).toBe('Al-Rashid')
    expect(raw.email).toBe('fatima@example.sa')
  })
})
