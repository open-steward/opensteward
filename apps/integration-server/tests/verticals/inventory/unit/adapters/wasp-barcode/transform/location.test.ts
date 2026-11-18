import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawWaspBarcodeLocation,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const rawSite: RawWaspBarcodeLocation = {
  SiteName: 'MAIN',
  LocationName: 'Main Warehouse',
  IsActive: true,
  Address1: '100 Warehouse Blvd',
  City: 'Austin',
  State: 'TX',
  Country: 'US',
  Zip: '78701',
}

const rawSubLocation: RawWaspBarcodeLocation = {
  LocationCode: 'A-01',
  LocationName: 'Aisle 1',
  SiteName: 'MAIN',
  IsActive: true,
}

describe('wasp-barcode transformLocation (site)', () => {
  it('sets id to SiteName when isSite=true', () => {
    const result = transformLocation(rawSite, true)
    expect(result.id).toBe('MAIN')
    expect(result.externalId).toBe('MAIN')
  })

  it('sets type=warehouse for a site record', () => {
    const result = transformLocation(rawSite, true)
    expect(result.type).toBe('warehouse')
  })

  it('maps name from LocationName', () => {
    const result = transformLocation(rawSite, true)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps address fields', () => {
    const result = transformLocation(rawSite, true)
    expect(result.address?.line1).toBe('100 Warehouse Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('sets isActive from IsActive', () => {
    const result = transformLocation(rawSite, true)
    expect(result.isActive).toBe(true)
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformLocation(rawSite, true)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid Location', () => {
    const result = transformLocation(rawSite, true)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('wasp-barcode transformLocation (sub-location)', () => {
  it('sets id to LocationCode for sub-locations', () => {
    const result = transformLocation(rawSubLocation)
    expect(result.id).toBe('A-01')
  })

  it('sets type=warehouse for sub-locations', () => {
    const result = transformLocation(rawSubLocation)
    expect(result.type).toBe('warehouse')
  })

  it('sets parentLocationId to SiteName', () => {
    const result = transformLocation(rawSubLocation)
    expect(result.parentLocationId).toBe('MAIN')
  })

  it('code is set to LocationCode for sub-locations', () => {
    const result = transformLocation(rawSubLocation)
    expect(result.code).toBe('A-01')
  })

  it('preserves raw location type in metadata.rawLocationType', () => {
    const result = transformLocation(rawSubLocation)
    expect(result.metadata['rawLocationType']).toBe('bin')
  })

  it('passes schema validation', () => {
    const result = transformLocation(rawSubLocation)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
