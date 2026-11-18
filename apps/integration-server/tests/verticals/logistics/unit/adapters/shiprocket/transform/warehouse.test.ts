/**
 * Shiprocket pickup locations -> Warehouse.
 *
 * First-party docs: Shiprocket's published Postman collection,
 * https://apidocs.shiprocket.in/ (Pickup Addresses > "Get All Pickup Locations"),
 * GET settings/company/pickup:
 *
 *   "Get a list of all pickup locations that have been added to your
 *    Shiprocket account through this API."
 *   "No parameters are required to use this API."
 *
 * Its "Successful Call" example nests the rows under
 * `data.shipping_address[]` (beside `allow_more`, `company_name` and
 * `recent_addresses`). The adapter used to read `data` as the array, which
 * throws on the real object.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type ShiprocketPickupAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shiprocket/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

/** The row from the documented "Successful Call" example, verbatim. */
function documentedPickupRow(
  overrides: Partial<ShiprocketPickupAddress> = {},
): ShiprocketPickupAddress {
  return {
    id: 4984500,
    pickup_location: 'Casa Moderna',
    address_type: null,
    address: '1900 GF, Sector 45',
    address_2: 'near Park 1',
    updated_address: false,
    old_address: '',
    old_address2: '',
    tag: '',
    tag_value: '',
    instruction: '',
    city: 'Gurgaon',
    state: 'Haryana',
    country: 'India',
    pin_code: '122003',
    email: 'abcxyz@gmail.com',
    is_first_mile_pickup: 0,
    phone: '9667667496',
    name: 'CASA MODERNA',
    company_id: 1138022,
    gstin: null,
    vendor_name: null,
    status: 2,
    phone_verified: 1,
    lat: '28.44786453607',
    long: '77.074250297017',
    open_time: null,
    close_time: null,
    warehouse_code: null,
    alternate_phone: '',
    rto_address_id: 4984500,
    lat_long_status: 1,
    new: 1,
    associated_rto_address: null,
    is_primary_location: 1,
    ...overrides,
  }
}

describe('shiprocket transformWarehouse (documented pickup row)', () => {
  it('parses against WarehouseSchema', () => {
    const w = WarehouseSchema.parse(transformWarehouse(documentedPickupRow()))
    expect(w.id).toBe('4984500')
  })

  it('maps the nickname, shipper and address fields the docs name', () => {
    const w = WarehouseSchema.parse(transformWarehouse(documentedPickupRow()))
    expect(w.name).toBe('Casa Moderna')
    expect(w.code).toBe('Casa Moderna')
    expect(w.address).toEqual({
      name: 'CASA MODERNA',
      street1: '1900 GF, Sector 45',
      street2: 'near Park 1',
      city: 'Gurgaon',
      state: 'Haryana',
      postalCode: '122003',
      phone: '9667667496',
      email: 'abcxyz@gmail.com',
    })
  })

  it('omits country: the docs give a country name ("India"), not ISO 3166 alpha-2', () => {
    const w = transformWarehouse(documentedPickupRow())
    expect(w.address?.country).toBeUndefined()
  })

  it('invents no isActive or timestamps: status codes are undocumented and the row has no dates', () => {
    const w = transformWarehouse(documentedPickupRow())
    expect(w.isActive).toBeUndefined()
    expect(w.createdAt).toBeUndefined()
    expect(w.updatedAt).toBeUndefined()
  })

  it('does not fall back to the shipper name when the nickname is missing', () => {
    const w = WarehouseSchema.parse(
      transformWarehouse(documentedPickupRow({ pickup_location: null })),
    )
    expect(w.name).toBeUndefined()
    expect(w.code).toBeUndefined()
  })

  it('drops empty-string fields, so a blank email still parses as an Address', () => {
    // The documented row itself carries '' values (old_address, tag, ...);
    // an empty email must not reach Address.email, which is z.email().
    const w = WarehouseSchema.parse(
      transformWarehouse(documentedPickupRow({ email: '', address_2: '' })),
    )
    expect(w.address?.email).toBeUndefined()
    expect(w.address?.street2).toBeUndefined()
    expect(w.address?.street1).toBe('1900 GF, Sector 45')
  })

  it('omits address when every mapped address field is empty', () => {
    const w = WarehouseSchema.parse(
      transformWarehouse(
        documentedPickupRow({
          name: null,
          address: '',
          address_2: '',
          city: null,
          state: null,
          pin_code: '',
          phone: null,
          email: '',
        }),
      ),
    )
    expect(w.address).toBeUndefined()
    expect(w.code).toBe('Casa Moderna')
  })

  it('keeps the raw row as metadata', () => {
    const w = transformWarehouse(documentedPickupRow())
    expect(w.metadata?.['is_primary_location']).toBe(1)
  })
})
