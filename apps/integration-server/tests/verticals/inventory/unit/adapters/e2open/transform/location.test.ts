import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawE2openLocation,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('e2open transformLocation', () => {
  const raw: RawE2openLocation = {
    locationId: 'LOC-001',
    locationName: 'East Coast DC',
    locationCode: 'ECD',
    locationType: 'DC',
    parentLocationId: 'LOC-000',
    addressLine1: '456 Commerce Blvd',
    addressLine2: 'Suite 100',
    city: 'Newark',
    state: 'NJ',
    countryCode: 'US',
    postalCode: '07101',
    isActive: true,
  }

  it('maps id and externalId from locationId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('LOC-001')
    expect(result.externalId).toBe('LOC-001')
  })

  it('maps name from locationName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('East Coast DC')
  })

  it('falls back to id when locationName absent', () => {
    const result = transformLocation({ ...raw, locationName: undefined })
    expect(result.name).toBe('LOC-001')
  })

  it('maps code from locationCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('ECD')
  })

  it('hardcodes type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('LOC-000')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('456 Commerce Blvd')
    expect(result.address?.line2).toBe('Suite 100')
    expect(result.address?.city).toBe('Newark')
    expect(result.address?.region).toBe('NJ')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('07101')
  })

  it('omits address when addressLine1, city, and countryCode are all absent', () => {
    const result = transformLocation({
      locationId: 'LOC-002',
      locationName: 'Virtual',
      isActive: true,
    })
    expect(result.address).toBeUndefined()
  })

  it('maps isActive from isActive field', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when absent', () => {
    const result = transformLocation({ ...raw, isActive: undefined })
    expect(result.isActive).toBe(true)
  })

  it('stores locationType in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata.locationType).toBe('DC')
  })

  it('sets platform to e2open', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
