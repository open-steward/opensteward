import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type TopshipAddress,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<TopshipAddress> = {}): TopshipAddress {
  return {
    name: 'Chidi Okeke',
    email: 'chidi@example.com',
    phoneNumber: '+2347000000001',
    addressLine1: '5 Allen Avenue',
    addressLine2: 'Floor 2',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'NG',
    countryCode: 'NG',
    postalCode: '101001',
    ...overrides,
  }
}

describe('topship transformAddress', () => {
  it('maps addressLine1 → street1', () => {
    const r = transformAddress(makeAddress())
    expect(r.street1).toBe('5 Allen Avenue')
  })

  it('maps addressLine2 → street2', () => {
    const r = transformAddress(makeAddress())
    expect(r.street2).toBe('Floor 2')
  })

  it('maps postalCode', () => {
    const r = transformAddress(makeAddress())
    expect(r.postalCode).toBe('101001')
  })

  it('prefers country over countryCode', () => {
    const r = transformAddress(makeAddress({ country: 'NG', countryCode: 'NGA' }))
    expect(r.country).toBe('NG')
  })

  it('falls back to countryCode when country is absent', () => {
    const r = transformAddress(makeAddress({ country: null }))
    expect(r.country).toBe('NG')
  })

  it('maps phoneNumber → phone', () => {
    const r = transformAddress(makeAddress())
    expect(r.phone).toBe('+2347000000001')
  })

  it('maps email', () => {
    const r = transformAddress(makeAddress())
    expect(r.email).toBe('chidi@example.com')
  })

  it('passes AddressSchema validation', () => {
    // country 'NG' is a valid ISO-3166-alpha-2 code
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })

  it('handles all-null fields gracefully', () => {
    const r = transformAddress({})
    expect(r.street1).toBeUndefined()
    expect(r.country).toBeUndefined()
    expect(() => AddressSchema.parse(r)).not.toThrow()
  })
})
