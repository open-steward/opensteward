/**
 * Haravan Location transform — verified against
 * https://docs.haravan.com/docs/omni-apis/location/ raw doc HTML.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawHaravanLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawHaravanLocation> = {}): RawHaravanLocation {
  return {
    id: 991324,
    name: 'Địa điểm mặc định',
    location_type: 'default',
    address1: '123 Nguyen Dinh Chieu',
    city: undefined,
    province: 'Ho Chi Minh',
    country: 'Vietnam',
    country_code: 'VN',
    zip: '700000',
    phone: '0332456789',
    created_at: '2020-10-22T03:35:39.461Z',
    updated_at: '2021-05-24T03:17:54.555Z',
    ...overrides,
  }
}

describe('transformLocation (haravan)', () => {
  it('maps id, name, and address from country_code/province', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('991324')
    expect(result.address?.country).toBe('VN')
    expect(result.address?.region).toBe('Ho Chi Minh')
  })

  it('maps location_type "default" to a fulfillment centre and "ontheroad" to not', () => {
    expect(transformLocation(makeRaw({ location_type: 'default' })).isFulfillmentCenter).toBe(true)
    expect(transformLocation(makeRaw({ location_type: 'ontheroad' })).isFulfillmentCenter).toBe(false)
    expect(transformLocation(makeRaw({ location_type: null })).isFulfillmentCenter).toBeUndefined()
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeRaw()))).not.toThrow()
  })
})
