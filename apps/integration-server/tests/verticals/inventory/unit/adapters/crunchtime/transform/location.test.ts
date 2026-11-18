import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCrunchtimeLocation,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('crunchtime transformLocation', () => {
  it('uses locationCode as id, externalId, and code', () => {
    const raw: RawCrunchtimeLocation = {
      locationCode: 'LOC-001',
      locationName: 'Austin Store',
      activeFlag: true,
    }
    const result = transformLocation(raw)

    expect(result.id).toBe('LOC-001')
    expect(result.externalId).toBe('LOC-001')
    expect(result.code).toBe('LOC-001')
  })

  it('maps locationName to name', () => {
    const raw: RawCrunchtimeLocation = {
      locationCode: 'LOC-002',
      locationName: 'Denver Restaurant',
    }
    const result = transformLocation(raw)
    expect(result.name).toBe('Denver Restaurant')
  })

  it('falls back to locationCode when locationName is absent', () => {
    const raw: RawCrunchtimeLocation = { locationCode: 'LOC-003' }
    const result = transformLocation(raw)
    expect(result.name).toBe('LOC-003')
  })

  it('sets type to store', () => {
    const raw: RawCrunchtimeLocation = { locationCode: 'LOC-004' }
    const result = transformLocation(raw)
    expect(result.type).toBe('store')
  })

  it('populates address when city, stateProvince, or country are present', () => {
    const raw: RawCrunchtimeLocation = {
      locationCode: 'LOC-005',
      city: 'Dallas',
      stateProvince: 'TX',
      country: 'US',
    }
    const result = transformLocation(raw)

    expect(result.address).toBeDefined()
    expect(result.address?.city).toBe('Dallas')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.country).toBe('US')
  })

  it('sets address to undefined when no address fields are present', () => {
    const raw: RawCrunchtimeLocation = { locationCode: 'LOC-006' }
    const result = transformLocation(raw)
    expect(result.address).toBeUndefined()
  })

  it('maps boolean activeFlag to isActive', () => {
    const rawActive: RawCrunchtimeLocation = { locationCode: 'LOC-007', activeFlag: true }
    const rawInactive: RawCrunchtimeLocation = { locationCode: 'LOC-008', activeFlag: false }

    expect(transformLocation(rawActive).isActive).toBe(true)
    expect(transformLocation(rawInactive).isActive).toBe(false)
  })

  it('defaults isActive to true when activeFlag is absent', () => {
    const raw: RawCrunchtimeLocation = { locationCode: 'LOC-009' }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores market, franchiseCode, and exportCode in metadata', () => {
    const raw: RawCrunchtimeLocation = {
      locationCode: 'LOC-010',
      market: 'Southwest',
      franchiseCode: 'FR-01',
      exportCode: 'EX-99',
    }
    const result = transformLocation(raw)

    expect(result.metadata['market']).toBe('Southwest')
    expect(result.metadata['franchiseCode']).toBe('FR-01')
    expect(result.metadata['exportCode']).toBe('EX-99')
  })

  it('passes LocationSchema validation', () => {
    const raw: RawCrunchtimeLocation = {
      locationCode: 'LOC-FULL',
      locationName: 'Full Test Store',
      city: 'Chicago',
      stateProvince: 'IL',
      country: 'US',
      market: 'Midwest',
      franchiseCode: 'FR-10',
      activeFlag: true,
    }
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
