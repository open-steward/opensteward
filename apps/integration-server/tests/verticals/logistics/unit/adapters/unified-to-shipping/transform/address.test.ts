import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  addressToUnified,
  type UnifiedAddress,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeUnified(overrides: Partial<UnifiedAddress> = {}): UnifiedAddress {
  return {
    name: 'Alice',
    companyName: 'Acme Co',
    address1: '100 Main St',
    address2: 'Suite 200',
    city: 'San Francisco',
    region: 'CA',
    postalCode: '94105',
    countryCode: 'US',
    telephone: '+14155550101',
    email: 'alice@example.com',
    ...overrides,
  }
}

describe('unified-to-shipping transformAddress', () => {
  it('maps name', () => {
    expect(transformAddress(makeUnified())?.name).toBe('Alice')
  })

  it('maps company from companyName', () => {
    expect(transformAddress(makeUnified())?.company).toBe('Acme Co')
  })

  it('maps street1 from address1', () => {
    expect(transformAddress(makeUnified())?.street1).toBe('100 Main St')
  })

  it('maps street2 from address2', () => {
    expect(transformAddress(makeUnified())?.street2).toBe('Suite 200')
  })

  it('maps city', () => {
    expect(transformAddress(makeUnified())?.city).toBe('San Francisco')
  })

  it('maps state from region', () => {
    expect(transformAddress(makeUnified())?.state).toBe('CA')
  })

  it('maps postalCode', () => {
    expect(transformAddress(makeUnified())?.postalCode).toBe('94105')
  })

  it('maps country from countryCode', () => {
    expect(transformAddress(makeUnified())?.country).toBe('US')
  })

  it('maps phone from telephone', () => {
    expect(transformAddress(makeUnified())?.phone).toBe('+14155550101')
  })

  it('maps email', () => {
    expect(transformAddress(makeUnified())?.email).toBe('alice@example.com')
  })

  it('falls back state to regionCode when region absent', () => {
    const result = transformAddress(makeUnified({ region: null, regionCode: 'CA' }))
    expect(result?.state).toBe('CA')
  })

  it('falls back country to country field when countryCode absent', () => {
    const result = transformAddress(makeUnified({ countryCode: null, country: 'US' }))
    expect(result?.country).toBe('US')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('returns undefined when all fields are absent/null', () => {
    expect(transformAddress({})).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    expect(() => AddressSchema.parse(transformAddress(makeUnified()))).not.toThrow()
  })
})

describe('unified-to-shipping addressToUnified round-trip', () => {
  it('round-trips through addressToUnified and back', () => {
    const original = makeUnified()
    const canonical = transformAddress(original)!
    const roundTripped = addressToUnified(canonical)!
    expect(roundTripped.name).toBe(canonical.name)
    expect(roundTripped.city).toBe(canonical.city)
    expect(roundTripped.countryCode).toBe(canonical.country)
  })

  it('returns undefined for undefined input', () => {
    expect(addressToUnified(undefined)).toBeUndefined()
  })
})
