import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawInvenTreeLocation,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — inventree warehouse', () => {
  const raw: RawInvenTreeLocation = {
    pk: 7,
    name: 'Shelf A',
    pathstring: 'Warehouse / Shelf A',
    description: 'Main shelf',
    parent: 1,
    items: 10,
    structural: false,
    external: false,
    icon: null,
    tags: [],
  }
  const result = transformLocation(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('7')
  })

  it('sets name from pathstring', () => {
    expect(result.name).toBe('Warehouse / Shelf A')
  })

  it('sets type to warehouse when external is false', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets parentLocationId from parent', () => {
    expect(result.parentLocationId).toBe('1')
  })

  it('sets isActive to true when structural is false', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — inventree external/virtual location', () => {
  const raw: RawInvenTreeLocation = {
    pk: 99,
    name: 'Vendor Storage',
    pathstring: undefined,
    external: true,
    structural: true,
  }
  const result = transformLocation(raw)

  it('sets type to virtual when external is true', () => {
    expect(result.type).toBe('virtual')
  })

  it('sets isActive to false when structural is true', () => {
    expect(result.isActive).toBe(false)
  })

  it('falls back to name when pathstring is absent', () => {
    expect(result.name).toBe('Vendor Storage')
  })

  it('parentLocationId is undefined when parent is absent', () => {
    expect(result.parentLocationId).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
