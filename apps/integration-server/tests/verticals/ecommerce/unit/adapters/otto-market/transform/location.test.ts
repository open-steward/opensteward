/**
 * OTTO Market return-warehouse address → canonical Location.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/returns-warehouse
 * (`GET /v2/returns-warehouse/addresses`; confirmed fields: `returnAddressId`,
 * `returnWarehouseType`). Street/city/zip field names are not shown with a
 * worked JSON example, so this transform reads them defensively — these
 * tests cover both the confirmed id field and the defensive fallbacks.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOttoReturnAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/otto-market/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeAddress(overrides: Partial<RawOttoReturnAddress> = {}): RawOttoReturnAddress {
  return {
    returnAddressId: 'addr-abc-123',
    returnWarehouseType: 'NATIONAL',
    city: 'Hamburg',
    zipCode: '20095',
    countryCode: 'DE',
    street: 'Wandsbeker Str',
    houseNumber: '3',
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('uses returnAddressId as the id — the confirmed path parameter', () => {
    const result = transformLocation(makeAddress())
    expect(result.id).toBe('addr-abc-123')
  })

  it('composes line1 from street + houseNumber and normalises the country code', () => {
    const result = transformLocation(makeAddress())
    expect(result.address).toEqual({
      line1: 'Wandsbeker Str 3',
      city: 'Hamburg',
      postalCode: '20095',
      country: 'DE',
    })
  })

  it('falls back name to city, then to the id, when no name/label field is present', () => {
    const withCity = transformLocation(makeAddress({ city: 'Berlin' }))
    expect(withCity.name).toBe('Berlin')

    const bare = transformLocation({ returnAddressId: 'addr-only' })
    expect(bare.name).toBe('addr-only')
    expect(bare.address).toBeUndefined()
  })

  it('rejects a non-alpha2 country value rather than fail schema validation', () => {
    const result = transformLocation(makeAddress({ countryCode: 'Germany' }))
    expect(result.address?.country).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeAddress()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeAddress()))).not.toThrow()
    expect(() => LocationSchema.parse(transformLocation({ returnAddressId: 'addr-only' }))).not.toThrow()
  })
})
