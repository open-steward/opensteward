/**
 * Fixtures from "Example of data returned" on
 * https://erplain.readme.io/v2.0/reference/locations-queries, with an address
 * built from /v2.0/reference/addresses-queries ("Country code (e.g. FR, US).").
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawErplainLocation,
} from '../../../../../../../src/verticals/inventory/adapters/erplain/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const warehouse: RawErplainLocation = {
  id: 100001,
  label: 'Main Warehouse',
  active: true,
  type: 'warehouse',
  shipping_cost: 5.5,
  phone: '+33 1 23 45 67 89',
  address: {
    address_1: '10 rue de la Paix',
    address_2: 'Bâtiment B',
    city: 'Paris',
    state: 'Île-de-France',
    postal_code: '75002',
    country: 'FR',
  },
}

const store: RawErplainLocation = {
  id: 100002,
  label: 'Store Paris',
  active: true,
  type: 'store',
  shipping_cost: 0.0,
  phone: '+33 1 23 45 67 90',
}

describe('erplain transformLocation', () => {
  it('parses against the canonical LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(warehouse))).not.toThrow()
    expect(() => LocationSchema.parse(transformLocation(store))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const l = LocationSchema.parse(transformLocation(warehouse))
    expect(l.id).toBe('100001')
    expect(l.externalId).toBe('100001')
    expect(l.name).toBe('Main Warehouse')
    expect(l.type).toBe('warehouse')
    expect(l.isActive).toBe(true)
    expect(l.code).toBeUndefined()
    expect(l.address).toEqual({
      line1: '10 rue de la Paix',
      line2: 'Bâtiment B',
      city: 'Paris',
      region: 'Île-de-France',
      postalCode: '75002',
      country: 'FR',
    })
    expect(l.metadata).toMatchObject({
      type: 'warehouse',
      phone: '+33 1 23 45 67 89',
      shipping_cost: '5.5',
    })
  })

  it('maps the LocationType enum', () => {
    expect(transformLocation(store).type).toBe('store')
    expect(transformLocation({ ...store, type: 'subcontractor' }).type).toBe('unknown')
    expect(transformLocation(store).address).toBeUndefined()
  })

  it('drops a country that is not an ISO code rather than failing the parse', () => {
    const l = transformLocation({
      ...warehouse,
      address: { ...warehouse.address, country: 'France' },
    })
    expect(() => LocationSchema.parse(l)).not.toThrow()
    expect(l.address?.country).toBeUndefined()
  })

  it('reads active: false', () => {
    expect(transformLocation({ ...store, active: false }).isActive).toBe(false)
  })

  // "Boolean value (true / false). The API could return also 0 (false) and 1
  // (true)" (https://erplain.readme.io/v2.0/reference/data-types).
  it('reads the documented 0 / 1 booleans', () => {
    expect(transformLocation({ ...store, active: 1 }).isActive).toBe(true)
    expect(transformLocation({ ...store, active: 0 }).isActive).toBe(false)
  })

  it('throws rather than guessing when the active flag is absent or undocumented', () => {
    expect(() => transformLocation({ ...store, active: null })).toThrow(/no active flag/)
    expect(() => transformLocation({ ...store, active: undefined })).toThrow(/no active flag/)
    for (const v of ['true', 'false', 'yes', '1']) {
      expect(() => transformLocation({ ...store, active: v as unknown as boolean })).toThrow(
        /no active flag/,
      )
    }
  })
})
