/**
 * Bold warehouse + zone → Location. Fixtures: the documented WarehouseConfig
 * and ZoneConfig examples in https://developer.boldcommerce.com/api/checkout-admin.openapi.yaml.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type RawBoldWarehouse,
  type RawBoldZone,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/warehouse'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

const warehouse: RawBoldWarehouse = {
  address: '123 Main St.',
  address2: 'c/o Buck Skaggstein',
  city: 'American Fork',
  province_code: 'UT',
  province: 'Utah',
  country_code: 'US',
  country: 'United States',
  postal_code: '84003',
  extended_postal_code: '52',
  zone_id: 283,
}
const zone: RawBoldZone = {
  id: 283,
  name: 'Western Region',
  type: 'warehouse',
  default: false,
  enabled: true,
}

describe('transformWarehouse (bold-commerce)', () => {
  it('maps the documented WarehouseConfig and its zone and passes LocationSchema', () => {
    const out = LocationSchema.parse(transformWarehouse(warehouse, zone))
    expect(out).toEqual({
      id: '283',
      name: 'Western Region',
      address: {
        line1: '123 Main St.',
        line2: 'c/o Buck Skaggstein',
        city: 'American Fork',
        region: 'UT',
        postalCode: '84003',
        country: 'US',
      },
      metadata: { warehouse, zone },
    })
  })

  it('omits nullable address parts Bold sent as null', () => {
    const out = LocationSchema.parse(
      transformWarehouse({ ...warehouse, address2: null, province_code: null }, zone),
    )
    expect(out.address).not.toHaveProperty('line2')
    expect(out.address).not.toHaveProperty('region')
  })

  it('throws when the zone has no name', () => {
    expect(() => transformWarehouse(warehouse, { id: 283 })).toThrow(/no name/)
  })
})
