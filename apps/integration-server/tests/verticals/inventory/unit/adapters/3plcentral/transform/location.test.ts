import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — facility (warehouse)', () => {
  const raw = { facilityIdentifier: { name: 'SF Warehouse', id: 1 } }
  const result = transformLocation(raw)

  it('sets id as facility:<id>', () => {
    expect(result.id).toBe('facility:1')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('sets name from facilityIdentifier.name', () => {
    expect(result.name).toBe('SF Warehouse')
  })

  it('has no parentLocationId', () => {
    expect(result.parentLocationId).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — location (bin)', () => {
  const raw = {
    locationId: 42,
    locationIdentifier: {
      id: 42,
      nameKey: {
        facilityIdentifier: { name: 'SF Warehouse', id: 1 },
        name: 'BIN-A1',
      },
    },
  }
  const result = transformLocation(raw)

  it('sets id from locationIdentifier.id', () => {
    expect(result.id).toBe('42')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets parentLocationId to facility:<facilityId>', () => {
    expect(result.parentLocationId).toBe('facility:1')
  })

  it('sets name from nameKey.name', () => {
    expect(result.name).toBe('BIN-A1')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('preserves raw location type in metadata.rawLocationType', () => {
    expect(result.metadata['rawLocationType']).toBe('bin')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
