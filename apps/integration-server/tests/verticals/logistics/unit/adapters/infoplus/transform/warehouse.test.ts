/**
 * Fixture: the `warehouse` definition of the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json).
 * The swagger ships no example body; every key below is one of its
 * properties, with a value of its declared type.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type InfoplusWarehouse,
} from '../../../../../../../src/verticals/logistics/adapters/infoplus/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

const DOCUMENTED: InfoplusWarehouse = {
  id: 7,
  client: 1,
  name: 'Main DC',
  address: 'Main DC, 100 Dock St',
  company: 'Acme Fulfilment',
  street1: '100 Dock St',
  street2: 'Suite 2',
  street3: '',
  city: 'Columbus',
  state: 'OH',
  zip: '43215',
  country: 'United States',
  phone: '614-555-0100',
  locationBarcodePrefix: 'MDC',
  lpnPrefix: 'L',
  createDate: '2025-01-02T03:04:05.000Z',
  modifyDate: '2025-02-03T04:05:06.000Z',
  customFields: {},
}

describe('infoplus transformWarehouse', () => {
  it('maps the documented fields and parses as a Warehouse', () => {
    const out = WarehouseSchema.parse(transformWarehouse(DOCUMENTED))
    expect(out.id).toBe('7')
    expect(out.name).toBe('Main DC')
    expect(out.address).toEqual({
      company: 'Acme Fulfilment',
      street1: '100 Dock St',
      street2: 'Suite 2',
      city: 'Columbus',
      state: 'OH',
      postalCode: '43215',
      phone: '614-555-0100',
    })
    expect(out.createdAt).toEqual(new Date('2025-01-02T03:04:05.000Z'))
    expect(out.updatedAt).toEqual(new Date('2025-02-03T04:05:06.000Z'))
  })

  it('does not put the free-text country into the ISO alpha-2 Address.country', () => {
    expect(transformWarehouse(DOCUMENTED).address?.country).toBeUndefined()
  })

  it('has no address when no address field is present', () => {
    expect(WarehouseSchema.parse(transformWarehouse({ id: 1 })).address).toBeUndefined()
  })
})
