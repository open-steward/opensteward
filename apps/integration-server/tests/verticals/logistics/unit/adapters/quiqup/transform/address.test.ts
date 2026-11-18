import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type QuiqupAddress,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/address'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<QuiqupAddress> = {}): QuiqupAddress {
  return {
    name: 'Jane Doe',
    company_name: 'Acme Ltd',
    address_line_1: '123 High Street',
    address_line_2: 'Floor 2',
    city: 'Dubai',
    postcode: '12345',
    country_code: 'AE',
    phone: '+971501234567',
    email: 'jane@acme.example',
    ...overrides,
  }
}

// ─── transformAddress ─────────────────────────────────────────────────────────

describe('Quiqup transformAddress', () => {
  it('maps all fields to canonical Address shape', () => {
    const result = transformAddress(makeRaw())
    expect(result?.name).toBe('Jane Doe')
    expect(result?.company).toBe('Acme Ltd')
    expect(result?.street1).toBe('123 High Street')
    expect(result?.street2).toBe('Floor 2')
    expect(result?.city).toBe('Dubai')
    expect(result?.postalCode).toBe('12345')
    expect(result?.country).toBe('AE')
    expect(result?.phone).toBe('+971501234567')
    expect(result?.email).toBe('jane@acme.example')
  })

  it('returns undefined when raw is null', () => {
    expect(transformAddress(null)).toBeUndefined()
  })

  it('returns undefined when raw is undefined', () => {
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('returns undefined when all fields are null/absent', () => {
    const result = transformAddress({
      name: null,
      company_name: null,
      address_line_1: null,
      city: null,
      postcode: null,
      country_code: null,
    })
    expect(result).toBeUndefined()
  })

  it('handles partial input gracefully', () => {
    const result = transformAddress({ city: 'Dubai', country_code: 'AE' })
    expect(result?.city).toBe('Dubai')
    expect(result?.country).toBe('AE')
    expect(result?.name).toBeUndefined()
  })
})
