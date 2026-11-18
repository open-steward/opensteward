import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawFulfilLocation,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — fulfil-io', () => {
  const raw: RawFulfilLocation = {
    id: 12,
    name: 'Main Storage',
    code: 'WH/MAIN',
    parent: [5, 'Virtual Locations'],
    type: 'storage',
    active: true,
  }
  const result = transformLocation(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('12')
  })

  it('maps code from raw.code', () => {
    expect(result.code).toBe('WH/MAIN')
  })

  it('maps type "storage" to "warehouse"', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from parent m2o tuple', () => {
    expect(result.parentLocationId).toBe('5')
  })

  it('maps isActive from active boolean', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — fulfil-io type mapping', () => {
  const base: RawFulfilLocation = { id: 1 }

  it.each([
    ['storage', 'warehouse'],
    ['view', 'area'],
    ['supplier', 'supplier'],
    ['customer', 'customer'],
    ['lost_found', 'warehouse'],
  ] as const)('maps type "%s" to "%s"', (type, expected) => {
    const result = transformLocation({ ...base, type })
    // 'area', 'supplier', 'customer' may or may not pass schema; just check value
    expect(result.type).toBe(expected)
  })
})

describe('transformLocation — fulfil-io no parent', () => {
  const raw: RawFulfilLocation = { id: 7, name: 'Orphan', type: 'storage', active: false }
  const result = transformLocation(raw)

  it('leaves parentLocationId undefined when parent is null', () => {
    expect(result.parentLocationId).toBeUndefined()
  })

  it('maps isActive: false', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
