import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTecsysLocation,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

function makeRaw(overrides: Partial<RawTecsysLocation> = {}): RawTecsysLocation {
  return {
    InternalName: 'LOC-MAIN',
    PublicName: 'Main Fulfillment Center',
    ShortCode: 'MFC',
    IsDefault: true,
    IsActive: true,
    ParentInternalName: 'LOC-REGION-EAST',
    AddressLine1: '500 Commerce Dr',
    AddressLine2: 'Dock B',
    City: 'Columbus',
    State: 'OH',
    ZipCode: '43215',
    CountryCode: 'US',
    ...overrides,
  }
}

describe('transformLocation (tecsys)', () => {
  it('maps id and externalId from InternalName', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('LOC-MAIN')
    expect(result.externalId).toBe('LOC-MAIN')
  })

  it('maps name from PublicName', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Main Fulfillment Center')
  })

  it('falls back to InternalName when PublicName is absent', () => {
    const result = transformLocation(makeRaw({ PublicName: undefined }))
    expect(result.name).toBe('LOC-MAIN')
  })

  it('maps code from ShortCode', () => {
    const result = transformLocation(makeRaw())
    expect(result.code).toBe('MFC')
  })

  it('type is always "warehouse"', () => {
    const result = transformLocation(makeRaw())
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from ParentInternalName', () => {
    const result = transformLocation(makeRaw())
    expect(result.parentLocationId).toBe('LOC-REGION-EAST')
  })

  it('maps address fields when present', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeDefined()
    expect(result.address!.line1).toBe('500 Commerce Dr')
    expect(result.address!.city).toBe('Columbus')
    expect(result.address!.region).toBe('OH')
    expect(result.address!.country).toBe('US')
    expect(result.address!.postalCode).toBe('43215')
  })

  it('omits address when no address fields are present', () => {
    const result = transformLocation(
      makeRaw({
        AddressLine1: undefined,
        City: undefined,
        State: undefined,
        ZipCode: undefined,
        CountryCode: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('isActive defaults to true when IsActive is absent', () => {
    const result = transformLocation(makeRaw({ IsActive: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when IsActive is false', () => {
    const result = transformLocation(makeRaw({ IsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('platform is "tecsys"', () => {
    const result = transformLocation(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
