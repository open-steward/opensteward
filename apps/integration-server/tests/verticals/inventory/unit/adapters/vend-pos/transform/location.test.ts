import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVendOutlet,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const baseRaw: RawVendOutlet = {
  id: 'outlet-uuid-001',
  name: 'Main Store',
  time_zone: 'America/Los_Angeles',
  currency: 'USD',
  physical_address1: '123 Market St',
  physical_address2: 'Suite 4',
  physical_suburb: 'Downtown',
  physical_city: 'San Francisco',
  physical_state: 'CA',
  physical_postcode: '94103',
  physical_country_id: 'US',
  deleted_at: null,
}

describe('vend-pos transformLocation', () => {
  it('maps id from id field', () => {
    expect(transformLocation(baseRaw).id).toBe('outlet-uuid-001')
  })

  it('maps name from name field', () => {
    expect(transformLocation(baseRaw).name).toBe('Main Store')
  })

  it('hardcodes type to store', () => {
    expect(transformLocation(baseRaw).type).toBe('store')
  })

  it('maps isActive true when deleted_at is null', () => {
    expect(transformLocation(baseRaw).isActive).toBe(true)
  })

  it('maps isActive false when deleted_at is present', () => {
    const result = transformLocation({ ...baseRaw, deleted_at: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('maps address from physical fields', () => {
    const result = transformLocation(baseRaw)
    expect(result.address?.line1).toBe('123 Market St')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('94103')
  })

  it('falls back to physical_suburb for city when physical_city absent', () => {
    const result = transformLocation({ ...baseRaw, physical_city: undefined })
    expect(result.address?.city).toBe('Downtown')
  })

  it('sets platform to vend-pos', () => {
    expect(transformLocation(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(baseRaw))).not.toThrow()
  })
})
