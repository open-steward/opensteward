import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawManhattanActiveLocation,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('manhattan-active transformLocation', () => {
  const raw: RawManhattanActiveLocation = {
    locationId: 'LOC-001',
    locationName: 'Main Warehouse',
    locationCode: 'WH-MAIN',
    locationType: 'SITE',
    facilityId: 'FAC-001',
    facilityName: 'Central Facility',
    parentLocationId: 'PARENT-001',
    isActive: true,
    isDefault: false,
    address: {
      addressLine1: '100 Warehouse Blvd',
      addressLine2: 'Unit 5',
      city: 'Chicago',
      stateProvince: 'IL',
      country: 'US',
      postalCode: '60601',
    },
  }

  it('maps id and externalId from locationId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('LOC-001')
    expect(result.externalId).toBe('LOC-001')
  })

  it('maps name from locationName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from locationCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH-MAIN')
  })

  it('maps SITE locationType to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps ZONE locationType to zone', () => {
    const result = transformLocation({ ...raw, locationType: 'ZONE' })
    expect(result.type).toBe('zone')
  })

  it('maps BIN locationType to bin', () => {
    const result = transformLocation({ ...raw, locationType: 'BIN' })
    expect(result.type).toBe('bin')
  })

  it('maps DOCK locationType to staging', () => {
    const result = transformLocation({ ...raw, locationType: 'DOCK' })
    expect(result.type).toBe('staging')
  })

  it('maps parentLocationId from parentLocationId field', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('PARENT-001')
  })

  it('falls back parentLocationId to facilityId when parentLocationId absent', () => {
    const result = transformLocation({ ...raw, parentLocationId: undefined })
    expect(result.parentLocationId).toBe('FAC-001')
  })

  it('maps address fields from address object', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Warehouse Blvd')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.region).toBe('IL')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('60601')
  })

  it('sets isActive from isActive flag', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when isActive absent', () => {
    const result = transformLocation({ ...raw, isActive: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to manhattan-active', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
