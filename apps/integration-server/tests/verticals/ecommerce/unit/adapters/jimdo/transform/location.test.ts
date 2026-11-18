import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawShopifyLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('transformLocation (jimdo)', () => {
  const raw: RawShopifyLocation = {
    id: 789,
    name: 'San Francisco Warehouse',
    active: true,
    address1: '1 Market St',
    address2: 'Suite 100',
    city: 'San Francisco',
    zip: '94105',
    province: 'California',
    province_code: 'CA',
    country: 'United States',
    country_code: 'US',
    phone: '+14155550123',
    legacy: false,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('789')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('San Francisco Warehouse')
  })

  it('maps active flag', () => {
    const result = transformLocation(raw)
    expect(result.active).toBe(true)
  })

  it('maps address with country_code preferred over country', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('1 Market St')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.country).toBe('US')
  })

  it('maps phone', () => {
    const result = transformLocation(raw)
    expect(result.phone).toBe('+14155550123')
  })

  it('marks non-legacy active location as fulfillment center', () => {
    const result = transformLocation(raw)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark legacy location as fulfillment center', () => {
    const result = transformLocation({ ...raw, legacy: true })
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformLocation', () => {
    const result = transformLocation(raw)
    const back = untransformLocation(result)
    expect(back.name).toBe(raw.name)
    expect(back.address1).toBe(raw.address1)
    expect(back.country_code).toBe('US')
  })
})
