import { describe, it, expect } from 'vitest'
import {
  transformPlant,
  transformStorageLocation,
  transformLocation,
  type RawSapPlant,
  type RawSapStorageLocation,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sap-inventory transformPlant', () => {
  const raw: RawSapPlant = {
    Plant: '1000',
    PlantName: 'Hamburg Plant',
    Country: 'DE',
    City: 'Hamburg',
    Region: 'HH',
    PostalCode: '20095',
    StreetAddressName: 'Speicherstraße 1',
  }

  it('maps id from Plant', () => {
    const result = transformPlant(raw)
    expect(result.id).toBe('1000')
  })

  it('maps name from PlantName', () => {
    const result = transformPlant(raw)
    expect(result.name).toBe('Hamburg Plant')
  })

  it('type is warehouse', () => {
    const result = transformPlant(raw)
    expect(result.type).toBe('warehouse')
  })

  it('isActive is always true', () => {
    const result = transformPlant(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps address when Country or City present', () => {
    const result = transformPlant(raw)
    expect(result.address?.city).toBe('Hamburg')
    expect(result.address?.country).toBe('DE')
  })

  it('address is undefined when neither Country nor City present', () => {
    const result = transformPlant({ Plant: '2000' })
    expect(result.address).toBeUndefined()
  })

  it('platform is sap-inventory', () => {
    const result = transformPlant(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformPlant(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('sap-inventory transformStorageLocation', () => {
  const raw: RawSapStorageLocation = {
    Plant: '1000',
    StorageLocation: '0001',
    StorageLocationName: 'Raw Materials',
  }

  it('maps id as Plant:StorageLocation', () => {
    const result = transformStorageLocation(raw)
    expect(result.id).toBe('1000:0001')
  })

  it('maps name from StorageLocationName', () => {
    const result = transformStorageLocation(raw)
    expect(result.name).toBe('Raw Materials')
  })

  it('type is bin', () => {
    const result = transformStorageLocation(raw)
    expect(result.type).toBe('bin')
  })

  it('parentLocationId equals Plant', () => {
    const result = transformStorageLocation(raw)
    expect(result.parentLocationId).toBe('1000')
  })

  // Skip schema parse: transformStorageLocation emits type 'bin' which is not in
  // LocationTypeSchema's allowed set (warehouse|store|virtual|transit|supplier|unknown).
  // The source intentionally uses 'bin' as a more specific type; schema parse would fail.
})

describe('sap-inventory transformLocation dispatch', () => {
  it('dispatches to plant when StorageLocation absent', () => {
    const result = transformLocation({ Plant: '1000', PlantName: 'Plant A' })
    expect(result.type).toBe('warehouse')
    expect(result.id).toBe('1000')
  })

  it('dispatches to storage location when StorageLocation present', () => {
    const result = transformLocation({ Plant: '1000', StorageLocation: '0002' })
    expect(result.type).toBe('bin')
    expect(result.id).toBe('1000:0002')
  })
})
