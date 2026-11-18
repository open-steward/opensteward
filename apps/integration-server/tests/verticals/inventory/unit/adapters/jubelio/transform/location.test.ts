import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawJubelioLocation,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — jubelio warehouse', () => {
  const raw: RawJubelioLocation = {
    location_id: 5,
    location_name: 'Main Warehouse',
    location_code: 'WH-MAIN',
    is_active: true,
    is_default: true,
    address: 'Jl. Sudirman No. 1',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    country: 'ID',
    postal_code: '10110',
    phone: '+62211234567',
  }
  const result = transformLocation(raw)

  it('sets id from location_id', () => {
    expect(result.id).toBe('5')
  })

  it('sets name from location_name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('sets code from location_code', () => {
    expect(result.code).toBe('WH-MAIN')
  })

  it('sets type to warehouse (hardcoded)', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive from is_active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from address', () => {
    expect(result.address?.line1).toBe('Jl. Sudirman No. 1')
  })

  it('maps address.city from city', () => {
    expect(result.address?.city).toBe('Jakarta')
  })

  it('maps address.region from province', () => {
    expect(result.address?.region).toBe('DKI Jakarta')
  })

  it('maps address.country from country', () => {
    expect(result.address?.country).toBe('ID')
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — inactive jubelio location no address', () => {
  const raw: RawJubelioLocation = {
    location_id: '10',
    location_name: 'Old Warehouse',
    is_active: false,
  }
  const result = transformLocation(raw)

  it('sets isActive to false', () => {
    expect(result.isActive).toBe(false)
  })

  it('address is undefined when no address fields', () => {
    expect(result.address).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
