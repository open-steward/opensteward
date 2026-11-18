import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSkusavvyLocation,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('skusavvy transformLocation', () => {
  const raw: RawSkusavvyLocation = {
    id: 'loc-01',
    name: 'Vancouver Warehouse',
    code: 'VAN',
    locationType: 'warehouse',
    active: true,
    parentId: undefined,
    address: {
      address1: '500 Waterfront Dr',
      address2: 'Unit 2',
      city: 'Vancouver',
      province: 'BC',
      country: 'CA',
      zip: 'V6B 1A1',
    },
  }

  it('maps id and name', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('loc-01')
    expect(result.name).toBe('Vancouver Warehouse')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps locationType "warehouse" to type "warehouse"', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps locationType "bin" to type "bin"', () => {
    const result = transformLocation({ ...raw, locationType: 'bin' })
    expect(result.type).toBe('bin')
  })

  it('maps nested address with province → region', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('500 Waterfront Dr')
    expect(result.address?.line2).toBe('Unit 2')
    expect(result.address?.city).toBe('Vancouver')
    expect(result.address?.region).toBe('BC')
    expect(result.address?.country).toBe('CA')
    expect(result.address?.postalCode).toBe('V6B 1A1')
  })

  it('sets isActive from active flag', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when active=false', () => {
    const result = transformLocation({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('maps parentId to parentLocationId', () => {
    const result = transformLocation({ ...raw, parentId: 'loc-00' })
    expect(result.parentLocationId).toBe('loc-00')
  })

  it('omits address when raw.address is absent', () => {
    const { address: _, ...noAddr } = raw
    const result = transformLocation(noAddr)
    expect(result.address).toBeUndefined()
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
