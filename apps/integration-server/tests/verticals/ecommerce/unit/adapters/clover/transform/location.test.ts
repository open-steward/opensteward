import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCloverMerchant,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeMerchant(overrides: Partial<RawCloverMerchant> = {}): RawCloverMerchant {
  return {
    id: 'MERCH_001',
    name: 'Downtown Coffee',
    address: {
      address1: '123 Main St',
      address2: 'Suite 100',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    phoneNumber: '+1 415 555 0100',
    ...overrides,
  }
}

describe('transformLocation (Clover)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeMerchant())
    expect(result.id).toBe('MERCH_001')
    expect(result.name).toBe('Downtown Coffee')
    expect(result.active).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeMerchant())
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.line2).toBe('Suite 100')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('maps phone number', () => {
    const result = transformLocation(makeMerchant())
    expect(result.phone).toBe('+1 415 555 0100')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeMerchant()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeMerchant())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('handles missing address gracefully', () => {
    const result = transformLocation(makeMerchant({ address: undefined }))
    expect(result.address).toBeUndefined()
  })
})
