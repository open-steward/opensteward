import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawConnectposOutlet,
} from '../../../../../../../src/verticals/inventory/adapters/connectpos/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('connectpos transformLocation', () => {
  it('maps id from outlet id and sets type to store', () => {
    const raw: RawConnectposOutlet = {
      id: 7,
      name: 'Downtown Store',
      is_active: 1,
    }
    const result = transformLocation(raw)

    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
    expect(result.type).toBe('store')
    expect(result.name).toBe('Downtown Store')
  })

  it('populates address when street, city, or country_id is present', () => {
    const raw: RawConnectposOutlet = {
      id: 10,
      name: 'LA Store',
      street: '100 Sunset Blvd',
      city: 'Los Angeles',
      country_id: 'US',
      region_id: 'CA',
      postcode: '90028',
    }
    const result = transformLocation(raw)

    expect(result.address).toBeDefined()
    expect(result.address?.line1).toBe('100 Sunset Blvd')
    expect(result.address?.city).toBe('Los Angeles')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('90028')
  })

  it('sets address to undefined when no address fields are present', () => {
    const raw: RawConnectposOutlet = { id: 3, name: 'No Address Store' }
    const result = transformLocation(raw)
    expect(result.address).toBeUndefined()
  })

  it('maps is_active numeric 1 to boolean true', () => {
    const raw: RawConnectposOutlet = { id: 1, is_active: 1 }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps is_active numeric 0 to boolean false', () => {
    const raw: RawConnectposOutlet = { id: 2, is_active: 0 }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is absent', () => {
    const raw: RawConnectposOutlet = { id: 5 }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores storeId, warehouseId, telephone in metadata', () => {
    const raw: RawConnectposOutlet = {
      id: 11,
      store_id: 3,
      warehouse_id: 8,
      telephone: '555-1234',
    }
    const result = transformLocation(raw)

    expect(result.metadata['storeId']).toBe('3')
    expect(result.metadata['warehouseId']).toBe('8')
    expect(result.metadata['telephone']).toBe('555-1234')
  })

  it('stores lat and lng in metadata', () => {
    const raw: RawConnectposOutlet = { id: 12, lat: '34.052', lng: '-118.243' }
    const result = transformLocation(raw)
    expect(result.metadata['lat']).toBe('34.052')
    expect(result.metadata['lng']).toBe('-118.243')
  })

  it('passes LocationSchema validation', () => {
    const raw: RawConnectposOutlet = {
      id: 99,
      name: 'Full Store',
      is_active: 1,
      store_id: 2,
      warehouse_id: 5,
      street: '42 Commerce Way',
      city: 'Seattle',
      country_id: 'US',
      region_id: 'WA',
      postcode: '98101',
      telephone: '206-555-0100',
      lat: '47.606',
      lng: '-122.332',
    }
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
