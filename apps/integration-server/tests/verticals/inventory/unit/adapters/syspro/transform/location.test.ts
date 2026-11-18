import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSysproLocation,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

function makeRaw(overrides: Partial<RawSysproLocation> = {}): RawSysproLocation {
  return {
    Warehouse: 'WH01',
    Description: 'Main Warehouse',
    AllowNegativeStock: 'N',
    NettingWarehouse: 'WH00',
    Address1: '1 Industrial Rd',
    Address2: 'Unit 3',
    Address3: 'Johannesburg',
    Address4: 'Gauteng',
    Address5: 'ZA',
    ...overrides,
  }
}

describe('transformLocation (syspro)', () => {
  it('maps id and externalId from Warehouse code', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('WH01')
    expect(result.externalId).toBe('WH01')
    expect(result.code).toBe('WH01')
  })

  it('maps name from Description', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Main Warehouse')
  })

  it('falls back to Warehouse code when Description is absent', () => {
    const result = transformLocation(makeRaw({ Description: undefined }))
    expect(result.name).toBe('WH01')
  })

  it('maps parentLocationId from NettingWarehouse', () => {
    const result = transformLocation(makeRaw())
    expect(result.parentLocationId).toBe('WH00')
  })

  it('type is always "warehouse"', () => {
    const result = transformLocation(makeRaw())
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields from Address1-5', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeDefined()
    expect(result.address!.line1).toBe('1 Industrial Rd')
    expect(result.address!.city).toBe('Johannesburg')
    expect(result.address!.region).toBe('Gauteng')
    expect(result.address!.country).toBe('ZA')
  })

  it('omits address when Address1, Address2, Address3 are all absent', () => {
    const result = transformLocation(
      makeRaw({ Address1: undefined, Address2: undefined, Address3: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('isActive is always true (SYSPRO has no active flag)', () => {
    const result = transformLocation(makeRaw())
    expect(result.isActive).toBe(true)
  })

  it('platform is "syspro"', () => {
    const result = transformLocation(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
