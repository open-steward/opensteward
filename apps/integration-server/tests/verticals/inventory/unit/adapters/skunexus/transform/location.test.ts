import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSkuNexusLocation,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('skunexus transformLocation', () => {
  const raw: RawSkuNexusLocation = {
    id: '42',
    name: 'Main Warehouse',
    code: 'MAIN',
    location_type: 'warehouse',
    parent_id: null,
    active: true,
    archived: false,
    address_line_1: '100 Commerce Blvd',
    city: 'Austin',
    state: 'TX',
    country_code: 'US',
    postal_code: '78701',
  }

  it('maps id and name', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.name).toBe('Main Warehouse')
    expect(result.platform).toBe('skunexus')
  })

  it('maps location_type "warehouse" to type "warehouse"', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps location_type "bin" to type "bin"', () => {
    const result = transformLocation({ ...raw, location_type: 'bin' })
    expect(result.type).toBe('bin')
  })

  it('maps location_type "zone" to type "bin"', () => {
    const result = transformLocation({ ...raw, location_type: 'zone' })
    expect(result.type).toBe('bin')
  })

  it('maps location_type "virtual" to type "virtual"', () => {
    const result = transformLocation({ ...raw, location_type: 'virtual' })
    expect(result.type).toBe('virtual')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Commerce Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    // country falls back from country_code when country is absent
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('sets isActive from archived=false (inverted)', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when archived=true', () => {
    const result = transformLocation({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('sets parentLocationId when parent_id is present', () => {
    const result = transformLocation({ ...raw, parent_id: '7' })
    expect(result.parentLocationId).toBe('7')
  })

  it('omits address when no address fields present', () => {
    const result = transformLocation({ id: '1', name: 'Empty' })
    expect(result.address).toBeUndefined()
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
