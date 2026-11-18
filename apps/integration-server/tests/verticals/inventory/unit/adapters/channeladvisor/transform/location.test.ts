import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawChannelAdvisorDistributionCenter,
} from '../../../../../../../src/verticals/inventory/adapters/channeladvisor/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('channeladvisor transformLocation', () => {
  it('maps id, name, code, and type correctly', () => {
    const raw: RawChannelAdvisorDistributionCenter = {
      ID: 42,
      Name: 'Main Warehouse',
      Code: 'MW1',
      IsActive: true,
    }
    const result = transformLocation(raw)

    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
    expect(result.name).toBe('Main Warehouse')
    expect(result.code).toBe('MW1')
    expect(result.type).toBe('warehouse')
    expect(result.isActive).toBe(true)
    expect(result.platform).toBe('channeladvisor')
  })

  it('populates address when address fields are present', () => {
    const raw: RawChannelAdvisorDistributionCenter = {
      ID: 7,
      Name: 'SF DC',
      AddressLine1: '123 Market St',
      AddressLine2: 'Suite 400',
      City: 'San Francisco',
      StateOrProvince: 'CA',
      Country: 'US',
      PostalCode: '94105',
    }
    const result = transformLocation(raw)

    expect(result.address).toBeDefined()
    expect(result.address?.line1).toBe('123 Market St')
    expect(result.address?.line2).toBe('Suite 400')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('94105')
  })

  it('sets address to undefined when no address fields are present', () => {
    const raw: RawChannelAdvisorDistributionCenter = { ID: 1, Name: 'No Address DC' }
    const result = transformLocation(raw)
    expect(result.address).toBeUndefined()
  })

  it('defaults isActive to true when IsActive is undefined', () => {
    const raw: RawChannelAdvisorDistributionCenter = { ID: 99 }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores profileId and isDefault in metadata', () => {
    const raw: RawChannelAdvisorDistributionCenter = {
      ID: 5,
      ProfileID: 1234,
      IsDefault: true,
    }
    const result = transformLocation(raw)
    expect(result.metadata['profileId']).toBe('1234')
    expect(result.metadata['isDefault']).toBe('true')
  })

  it('passes LocationSchema validation', () => {
    const raw: RawChannelAdvisorDistributionCenter = {
      ID: 10,
      Name: 'Test DC',
      Code: 'TDC',
      IsActive: true,
      ProfileID: 999,
      IsDefault: false,
      City: 'Austin',
      StateOrProvince: 'TX',
      Country: 'US',
    }
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
