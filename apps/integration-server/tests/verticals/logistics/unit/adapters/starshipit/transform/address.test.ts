import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type StarshipitAddress,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeRaw(overrides: Partial<StarshipitAddress> = {}): StarshipitAddress {
  return {
    name: 'Jane Doe',
    phone: '+61400000000',
    email: 'jane@example.com',
    company: 'Acme Pty Ltd',
    street: '1 Collins Street',
    suburb: 'Melbourne',
    state: 'VIC',
    post_code: '3000',
    country_code: 'AU',
    delivery_instructions: 'Leave at door',
    ...overrides,
  }
}

describe('starshipit transformAddress', () => {
  it('maps name', () => {
    expect(transformAddress(makeRaw())?.name).toBe('Jane Doe')
  })

  it('maps company', () => {
    expect(transformAddress(makeRaw())?.company).toBe('Acme Pty Ltd')
  })

  it('maps street1 from street', () => {
    expect(transformAddress(makeRaw())?.street1).toBe('1 Collins Street')
  })

  it('maps city from suburb', () => {
    expect(transformAddress(makeRaw())?.city).toBe('Melbourne')
  })

  it('falls back city to city field when suburb is absent', () => {
    const addr = transformAddress(makeRaw({ suburb: null, city: 'Sydney' }))
    expect(addr?.city).toBe('Sydney')
  })

  it('maps state', () => {
    expect(transformAddress(makeRaw())?.state).toBe('VIC')
  })

  it('maps postalCode from post_code', () => {
    expect(transformAddress(makeRaw())?.postalCode).toBe('3000')
  })

  it('maps country from country_code', () => {
    expect(transformAddress(makeRaw())?.country).toBe('AU')
  })

  it('falls back country to country when country_code is absent', () => {
    const addr = transformAddress(makeRaw({ country_code: null, country: 'AU' }))
    expect(addr?.country).toBe('AU')
  })

  it('maps phone', () => {
    expect(transformAddress(makeRaw())?.phone).toBe('+61400000000')
  })

  it('maps email', () => {
    expect(transformAddress(makeRaw())?.email).toBe('jane@example.com')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('returns undefined when all fields are null/undefined', () => {
    expect(transformAddress({})).toBeUndefined()
  })

  it('produces schema-valid Address', () => {
    const addr = transformAddress(makeRaw())
    expect(() => AddressSchema.parse(addr)).not.toThrow()
  })
})
