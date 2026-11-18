import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSphereWmsLocation,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — spherewms', () => {
  const raw: RawSphereWmsLocation = {
    location_id: 'LOC-001',
    location_name: 'Main Warehouse',
    division_code: 'DIV-A',
    client_code: 'CLIENT-1',
    address_1: '123 Commerce Blvd',
    address_2: 'Suite 400',
    city: 'Austin',
    state_province: 'TX',
    zip_code: '78701',
    country: 'US',
    contact_name: 'Jane Smith',
    contact_title: 'Manager',
    phone_number: '+15125550100',
  }
  const result = transformLocation(raw)

  it('maps id from location_id', () => {
    expect(result.id).toBe('LOC-001')
  })

  it('maps externalId from location_id', () => {
    expect(result.externalId).toBe('LOC-001')
  })

  it('maps name from location_name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from division_code', () => {
    expect(result.code).toBe('DIV-A')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('maps address.line1 from address_1', () => {
    expect(result.address?.line1).toBe('123 Commerce Blvd')
  })

  it('maps address.city from city', () => {
    expect(result.address?.city).toBe('Austin')
  })

  it('maps address.country from country', () => {
    expect(result.address?.country).toBe('US')
  })

  it('maps contact info into metadata', () => {
    expect(result.metadata['contactName']).toBe('Jane Smith')
    expect(result.metadata['clientCode']).toBe('CLIENT-1')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — spherewms no address', () => {
  const raw: RawSphereWmsLocation = {
    location_id: 'LOC-BARE',
    location_name: 'Bare Location',
  }
  const result = transformLocation(raw)

  it('leaves address undefined when no address fields', () => {
    expect(result.address).toBeUndefined()
  })

  it('falls back name to location_id when location_name absent', () => {
    const noName = transformLocation({ location_id: 'LOC-NNN' })
    expect(noName.name).toBe('LOC-NNN')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
