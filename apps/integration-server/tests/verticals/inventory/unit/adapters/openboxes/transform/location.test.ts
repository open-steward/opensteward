import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOpenboxesLocation,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('openboxes transformLocation', () => {
  const raw: RawOpenboxesLocation = {
    id: 'loc-001',
    name: 'Main Warehouse',
    description: 'Primary storage facility',
    locationNumber: 'WH-001',
    locationGroup: 'Group A',
    parentLocation: { id: 'loc-parent', name: 'Parent Loc' },
    locationType: {
      id: 'lt-1',
      name: 'Depot',
      locationTypeCode: 'DEPOT',
    },
    locationTypeCode: 'DEPOT',
  }

  it('maps id and externalId from id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('loc-001')
    expect(result.externalId).toBe('loc-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from locationNumber', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH-001')
  })

  it('maps DEPOT locationTypeCode to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps SUPPLIER locationTypeCode to supplier', () => {
    const result = transformLocation({ ...raw, locationTypeCode: 'SUPPLIER' })
    expect(result.type).toBe('supplier')
  })

  it('maps VIRTUAL locationTypeCode to virtual', () => {
    const result = transformLocation({ ...raw, locationTypeCode: 'VIRTUAL' })
    expect(result.type).toBe('virtual')
  })

  it('maps BIN_LOCATION locationTypeCode to unknown', () => {
    const result = transformLocation({ ...raw, locationTypeCode: 'BIN_LOCATION' })
    expect(result.type).toBe('unknown')
  })

  it('maps parentLocationId from parentLocation.id', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('loc-parent')
  })

  it('sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to openboxes', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
