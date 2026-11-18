import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTruecommerceLocation,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawTruecommerceLocation> = {}): RawTruecommerceLocation {
  return {
    location_id: 'loc_001',
    location_name: 'Main Warehouse',
    location_code: 'MAIN',
    is_default: true,
    is_active: true,
    parent_location_id: undefined,
    address: {
      line1: '100 Commerce Drive',
      line2: 'Suite 5',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      postal_code: '78701',
    },
    ...overrides,
  }
}

// ─── transformLocation ────────────────────────────────────────────────────────

describe('transformLocation', () => {
  it('maps id and externalId from location_id', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('loc_001')
    expect(result.externalId).toBe('loc_001')
  })

  it('maps name from location_name', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from location_code', () => {
    const result = transformLocation(makeRaw())
    expect(result.code).toBe('MAIN')
  })

  it('hardcodes type to "warehouse"', () => {
    const result = transformLocation(makeRaw())
    expect(result.type).toBe('warehouse')
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformLocation(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  it('maps address.state to address.region', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.region).toBe('TX')
  })

  it('maps address fields correctly', () => {
    const result = transformLocation(makeRaw())
    expect(result.address?.line1).toBe('100 Commerce Drive')
    expect(result.address?.line2).toBe('Suite 5')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('maps isActive from is_active boolean', () => {
    const result = transformLocation(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is absent', () => {
    const result = transformLocation(makeRaw({ is_active: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('maps is_active from string "1"', () => {
    const result = transformLocation(makeRaw({ is_active: '1' }))
    expect(result.isActive).toBe(true)
  })

  it('maps parentLocationId from parent_location_id', () => {
    const result = transformLocation(makeRaw({ parent_location_id: 'loc_000' }))
    expect(result.parentLocationId).toBe('loc_000')
  })

  it('puts isDefault in metadata as a string', () => {
    const result = transformLocation(makeRaw({ is_default: true }))
    expect(result.metadata['isDefault']).toBe('true')
  })

  it('omits address when raw.address is undefined', () => {
    const result = transformLocation(makeRaw({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('uses empty string for name when location_name is absent', () => {
    const result = transformLocation(makeRaw({ location_name: undefined }))
    expect(result.name).toBe('')
  })

  it('passes LocationSchema.parse without throwing', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
