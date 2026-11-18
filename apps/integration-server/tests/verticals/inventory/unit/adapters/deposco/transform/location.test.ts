import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawDeposcoFacility,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('deposco transformLocation', () => {
  const raw: RawDeposcoFacility = {
    facilityNumber: 'FAC-001',
    facilityName: 'Atlanta DC',
    facilityCode: 'ATL',
    active: 'Y',
    address1: '200 Peachtree St',
    address2: 'Dock A',
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    zip: '30303',
  }

  it('maps id and externalId from facilityNumber', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('FAC-001')
    expect(result.externalId).toBe('FAC-001')
  })

  it('maps name from facilityName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Atlanta DC')
  })

  it('falls back to facilityNumber when facilityName absent', () => {
    const result = transformLocation({ facilityNumber: 'FAC-002' })
    expect(result.name).toBe('FAC-002')
  })

  it('maps code from facilityCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('ATL')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields when address data is present', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('200 Peachtree St')
    expect(result.address?.city).toBe('Atlanta')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('30303')
  })

  it('leaves address undefined when no address fields provided', () => {
    const result = transformLocation({ facilityNumber: 'FAC-003' })
    expect(result.address).toBeUndefined()
  })

  it('maps isActive from "Y"/"N" string', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false for "N"', () => {
    const result = transformLocation({ ...raw, active: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active absent', () => {
    const result = transformLocation({ facilityNumber: 'FAC-004' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to deposco', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
