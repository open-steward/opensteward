/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/CompanyProfile/CompanyProfilePlatformModel.js` —
 * `GetLocationSchema()` / `GetAddressSchema()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawFyndLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawFyndLocation> = {}): RawFyndLocation {
  return {
    uid: 7,
    display_name: 'Mumbai Warehouse',
    phone_number: '+919820012345',
    address: {
      address1: '123 Industrial Estate',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country_code: 'IN',
    },
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps core fields and stringifies uid as id', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('7')
    expect(result.name).toBe('Mumbai Warehouse')
    expect(result.phone).toBe('+919820012345')
  })

  it('maps address using the ISO country_code, not the free-text country name', () => {
    const result = transformLocation(makeLocation())
    expect(result.address).toEqual({
      line1: '123 Industrial Estate',
      line2: undefined,
      city: 'Mumbai',
      region: 'Maharashtra',
      postalCode: '400001',
      country: 'IN',
    })
  })

  it('throws when uid is missing', () => {
    expect(() => transformLocation({ ...makeLocation(), uid: undefined as unknown as number })).toThrow(
      /uid/,
    )
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    expect(transformLocation(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
