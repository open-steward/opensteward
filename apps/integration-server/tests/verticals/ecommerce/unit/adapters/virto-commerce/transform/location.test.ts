/**
 * Virto Commerce FulfillmentCenter → canonical Location.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Inventory/swagger.json `components.schemas.
 * FulfillmentCenter` / `InventoryAddress` (fetched 2026-09-13).
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVirtoFulfillmentCenter,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeCenter(overrides: Partial<RawVirtoFulfillmentCenter> = {}): RawVirtoFulfillmentCenter {
  return {
    id: 'fc-1',
    name: 'Main Warehouse',
    address: {
      line1: '1 Infinite Loop',
      city: 'Cupertino',
      regionName: 'CA',
      postalCode: '95014',
      countryCode: 'US',
      phone: '+14155550123',
    },
    ...overrides,
  }
}

describe('transformLocation (virto-commerce)', () => {
  it('maps core fields and flags every fulfillment center as a fulfillment location', () => {
    const result = transformLocation(makeCenter())
    expect(result.id).toBe('fc-1')
    expect(result.name).toBe('Main Warehouse')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('leaves active unset — FulfillmentCenter has no active/enabled field', () => {
    expect(transformLocation(makeCenter()).active).toBeUndefined()
  })

  it('maps the embedded address', () => {
    const result = transformLocation(makeCenter())
    expect(result.address).toEqual({
      line1: '1 Infinite Loop',
      line2: undefined,
      city: 'Cupertino',
      region: 'CA',
      postalCode: '95014',
      country: 'US',
    })
    expect(result.phone).toBe('+14155550123')
  })

  it('has no address when the fulfillment center carries none', () => {
    const result = transformLocation(makeCenter({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCenter()
    expect(transformLocation(raw).metadata).toEqual(raw)
  })

  it('satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeCenter()))).not.toThrow()
    expect(() => LocationSchema.parse(transformLocation({ id: 'fc-2', name: 'Bare' }))).not.toThrow()
  })
})
