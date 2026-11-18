/**
 * Shape verified against https://idosell.readme.io/reference/wmslocationsget
 * (`GET /wms/locations`): `locationId`, `locationName`, `locationPath`,
 * `locationCode`, `stockId`, `parentId`, `products[]`. No address or
 * active/fulfillment-center field is documented.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawIdosellWmsLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawIdosellWmsLocation> = {}): RawIdosellWmsLocation {
  return {
    locationId: 20,
    locationName: 'A-01-02',
    locationCode: 'A0102',
    stockId: 1,
    parentId: 0,
    ...overrides,
  }
}

describe('transformLocation (idosell)', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('20')
    expect(result.name).toBe('A-01-02')
  })

  it('falls back to locationCode when locationName is absent', () => {
    expect(transformLocation(makeRaw({ locationName: undefined })).name).toBe('A0102')
  })

  it('falls back to the id when neither name nor code is present', () => {
    expect(transformLocation(makeRaw({ locationName: undefined, locationCode: undefined })).name).toBe('20')
  })

  it('does not invent an address or fulfillment-center flag — undocumented', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeUndefined()
    expect(result.isFulfillmentCenter).toBeUndefined()
    expect(result.active).toBeUndefined()
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeRaw()))).not.toThrow()
  })
})
