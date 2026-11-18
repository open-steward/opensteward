import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/prediko/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — prediko warehouse', () => {
  const raw = {
    id: 'wh_abc123',
    name: 'Main Warehouse',
    active: true,
    store_name: 'My Store',
    is_combined: false,
    child_warehouses: ['wh_child1'],
    address: {
      address1: '123 Main St',
      address2: 'Suite 4',
      city: 'San Francisco',
      province: 'CA',
      country: 'US',
      zip: '94105',
    },
  }
  const result = transformLocation(raw)

  it('sets id from raw.id (string)', () => {
    expect(result.id).toBe('wh_abc123')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('wh_abc123')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('leaves code undefined (Prediko does not expose warehouse codes)', () => {
    expect(result.code).toBeUndefined()
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive from raw.active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address fields correctly (province → region)', () => {
    expect(result.address).toEqual({
      line1: '123 Main St',
      line2: 'Suite 4',
      city: 'San Francisco',
      region: 'CA',
      country: 'US',
      postalCode: '94105',
    })
  })

  it('stores storeName in metadata', () => {
    expect(result.metadata['storeName']).toBe('My Store')
  })

  it('sets platform to prediko', () => {
    expect(result.platform).toBe('prediko')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — minimal input', () => {
  const result = transformLocation({ id: 'wh_min' })

  it('sets name to empty string when missing', () => {
    expect(result.name).toBe('')
  })

  it('leaves address undefined when not present', () => {
    expect(result.address).toBeUndefined()
  })

  it('defaults isActive to true when active absent', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
