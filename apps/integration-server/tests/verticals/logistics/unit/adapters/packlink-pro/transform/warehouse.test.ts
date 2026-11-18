/**
 * Fixture: the first row of Packlink's own API response fixture for
 * GET v1/clients/warehouses, verbatim from packlink-dev/ecommerce_module_core
 * tests/BusinessLogic/Common/ApiResponses/warehouses.json. Field meanings are
 * from the same repo's src/BusinessLogic/Warehouse/Warehouse.php DTO.
 */
import { describe, it, expect } from 'vitest'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import {
  transformWarehouse,
  type PacklinkProWarehouse,
} from '../../../../../../../src/verticals/logistics/adapters/packlink-pro/transform/warehouse'

const DOC_ROW: PacklinkProWarehouse = {
  city: 'El Piquillo 2',
  surname: 'MyLastname2',
  name: 'MyName2',
  phone: '1234567',
  country: 'ES',
  company: 'MyCompanyName2',
  default_selection: true,
  email: 'example2@email.com',
  alias: 'MyWarehouse2',
  postal_code: '28041',
  address: 'MyAddress2',
  created_at: '2018-11-08 15:44:21',
  id: '222459d5e4b0ed5488fe91544',
}

describe('Packlink PRO transformWarehouse', () => {
  it('maps the documented example row and parses against WarehouseSchema', () => {
    const w = WarehouseSchema.parse(transformWarehouse(DOC_ROW))
    expect(w.id).toBe('222459d5e4b0ed5488fe91544')
    expect(w.name).toBe('MyWarehouse2')
    expect(w.address).toEqual({
      name: 'MyName2 MyLastname2',
      company: 'MyCompanyName2',
      street1: 'MyAddress2',
      city: 'El Piquillo 2',
      postalCode: '28041',
      country: 'ES',
      phone: '1234567',
      email: 'example2@email.com',
    })
    expect(w.metadata).toEqual(DOC_ROW)
  })

  it('does not read default_selection as isActive, nor a zoneless created_at as a date', () => {
    const w = transformWarehouse(DOC_ROW)
    expect(w.isActive).toBeUndefined()
    expect(w.createdAt).toBeUndefined()
    expect(w.code).toBeUndefined()
  })

  it('splits a "zip - city" postal_code the way the first-party Warehouse DTO does', () => {
    const w = WarehouseSchema.parse(
      transformWarehouse({ ...DOC_ROW, postal_code: '28041 - Madrid', city: 'ignored' }),
    )
    expect(w.address?.postalCode).toBe('28041')
    expect(w.address?.city).toBe('Madrid')
  })

  it('omits a country that is not an ISO alpha-2 code rather than guessing', () => {
    const w = WarehouseSchema.parse(transformWarehouse({ ...DOC_ROW, country: 'Spain' }))
    expect(w.address?.country).toBeUndefined()
  })

  it('emits no address for a row with no address fields', () => {
    expect(transformWarehouse({ id: 'w1', alias: 'Only alias' }).address).toBeUndefined()
  })

  it('treats an empty-string id as absent rather than as an id', () => {
    expect(transformWarehouse({ ...DOC_ROW, id: '' }).id).toBeUndefined()
  })
})
