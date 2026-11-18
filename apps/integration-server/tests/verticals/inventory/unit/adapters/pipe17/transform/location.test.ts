import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — pipe17 location', () => {
  const raw = {
    locationId: 'loc_sfo1',
    name: 'SF Warehouse',
    type: 'WAREHOUSE',
    active: true,
    integration: 'shipbob',
    address: {
      street: '123 Main St',
      street2: 'Suite 4',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
  }
  const result = transformLocation(raw)

  it('sets id from locationId', () => {
    expect(result.id).toBe('loc_sfo1')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('loc_sfo1')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('SF Warehouse')
  })

  it('sets type to warehouse (canonical, not raw type)', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive from raw.active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address fields correctly', () => {
    expect(result.address).toEqual({
      line1: '123 Main St',
      line2: 'Suite 4',
      city: 'San Francisco',
      region: 'CA',
      country: 'US',
      postalCode: '94105',
    })
  })

  it('stores integration in metadata', () => {
    expect(result.metadata['integration']).toBe('shipbob')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — minimal input', () => {
  const result = transformLocation({})

  it('sets id to empty string when locationId absent', () => {
    expect(result.id).toBe('')
  })

  it('sets name to empty string when missing', () => {
    expect(result.name).toBe('')
  })

  it('leaves address undefined when not present', () => {
    expect(result.address).toBeUndefined()
  })

  it('defaults isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
