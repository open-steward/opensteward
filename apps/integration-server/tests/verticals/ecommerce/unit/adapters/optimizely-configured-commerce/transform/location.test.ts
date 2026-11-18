/**
 * Optimizely Configured Commerce `transformLocation` — maps the Storefront
 * v1 WarehouseDto to the canonical Location shape. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/warehousesv1_getcollectionasync
 */
import { describe, it, expect } from 'vitest'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'
import {
  transformLocation,
  type RawOptimizelyWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/transform/location'

describe('Optimizely transformLocation', () => {
  it('produces output that satisfies the canonical Location schema', () => {
    const out = transformLocation({
      id: 'w1',
      name: 'East Coast DC',
      address1: '2500 Market Street',
      city: 'Philadelphia',
      state: 'PA',
      postalCode: '19103',
      phone: '+12155550100',
    })
    expect(() => LocationSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    expect(() => LocationSchema.parse(transformLocation({ id: 'min' }))).not.toThrow()
  })

  it('maps name, falling back to id', () => {
    expect(transformLocation({ id: '1', name: 'DC' }).name).toBe('DC')
    expect(transformLocation({ id: '2' }).name).toBe('2')
  })

  it('marks a warehouse with deactivateOn as inactive', () => {
    expect(transformLocation({ id: '3', deactivateOn: '2026-01-01T00:00:00Z' }).active).toBe(false)
  })

  it('leaves active undefined rather than asserting true when unstated', () => {
    expect(transformLocation({ id: '4' }).active).toBeUndefined()
  })

  it('does not map countryId onto address.country (it is a UUID, not an ISO alpha-2 code)', () => {
    const out = transformLocation({ id: '5', countryId: 'a1b2c3d4-0000-0000-0000-000000000000' })
    expect(out.address?.country).toBeUndefined()
  })

  it('maps address1/city/state/postalCode onto the canonical address', () => {
    const out = transformLocation({
      id: '6',
      address1: '1 Main St',
      city: 'Boston',
      state: 'MA',
      postalCode: '02101',
    })
    expect(out.address).toEqual({
      line1: '1 Main St',
      line2: undefined,
      city: 'Boston',
      region: 'MA',
      postalCode: '02101',
    })
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawOptimizelyWarehouse = { id: '7' }
    expect(transformLocation(raw).metadata).toBe(raw)
  })
})
