import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawShopifyLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawShopifyLocation> = {}): RawShopifyLocation {
  return {
    id: 100,
    name: 'Main Warehouse',
    active: true,
    address1: '5 Commerce Dr',
    city: 'Portland',
    zip: '97201',
    province: 'Oregon',
    country_code: 'US',
    phone: '+1-503-555-0100',
    legacy: false,
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('100')
    expect(typeof result.id).toBe('string')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1-503-555-0100')
  })

  it('maps address fields from the location object', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('5 Commerce Dr')
    expect(result.address?.city).toBe('Portland')
    expect(result.address?.postalCode).toBe('97201')
    expect(result.address?.region).toBe('Oregon')
    expect(result.address?.country).toBe('US')
  })

  it('sets isFulfillmentCenter true when active and not legacy', () => {
    const result = transformLocation(makeLocation({ active: true, legacy: false }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('sets isFulfillmentCenter undefined when active is false', () => {
    const result = transformLocation(makeLocation({ active: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('sets isFulfillmentCenter undefined when legacy is true', () => {
    const result = transformLocation(makeLocation({ legacy: true }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformLocation({
      id: 100,
      name: 'No Address Location',
    })
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformLocation', () => {
    const canonical = transformLocation(makeLocation())
    const raw = untransformLocation(canonical)
    expect(raw.name).toBe('Main Warehouse')
    expect(raw.active).toBe(true)
    expect(raw.address1).toBe('5 Commerce Dr')
    expect(raw.city).toBe('Portland')
    expect(raw.zip).toBe('97201')
    expect(raw.country_code).toBe('US')
    expect(raw.phone).toBe('+1-503-555-0100')
  })
})
