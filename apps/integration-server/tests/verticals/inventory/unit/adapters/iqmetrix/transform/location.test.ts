import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawIqmetrixLocation,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — iqmetrix store', () => {
  const raw: RawIqmetrixLocation = {
    Id: 12,
    Name: 'Dufferin Mall',
    DisplayName: 'Dufferin Mall Display',
    Description: 'Flagship store',
    Address: {
      AddressLine1: '900 Dufferin St',
      AddressLine2: 'Unit 1',
      City: 'Toronto',
      StateCode: 'ON',
      StateName: 'Ontario',
      CountryCode: 'CA',
      CountryName: 'Canada',
      Zip: 'M6H 4B3',
    },
    CreatedUtc: '2024-03-01T00:00:00Z',
    LastModifiedUtc: '2024-03-01T00:00:00Z',
    Version: 3,
  }
  const result = transformLocation(raw)

  it('sets id from Id', () => {
    expect(result.id).toBe('12')
  })

  it('sets name from Name', () => {
    expect(result.name).toBe('Dufferin Mall')
  })

  it('sets type to store', () => {
    expect(result.type).toBe('store')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from AddressLine1', () => {
    expect(result.address?.line1).toBe('900 Dufferin St')
  })

  it('maps address.city from City', () => {
    expect(result.address?.city).toBe('Toronto')
  })

  it('maps address.region from StateCode', () => {
    expect(result.address?.region).toBe('ON')
  })

  it('maps address.country from CountryCode', () => {
    expect(result.address?.country).toBe('CA')
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — no address', () => {
  const raw: RawIqmetrixLocation = {
    Id: 'loc-99',
    Name: 'Remote Store',
  }
  const result = transformLocation(raw)

  it('address is undefined when no Address provided', () => {
    expect(result.address).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
