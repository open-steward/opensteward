import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVersaLocation,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const baseRaw: RawVersaLocation = {
  id: 'loc-001',
  location_name: 'Main Warehouse',
  location_code: 'MAIN-WH',
  is_default: true,
  is_active: true,
  parent_location_id: null,
  address_line1: '123 Industrial Blvd',
  address_line2: 'Unit B',
  city: 'Austin',
  state: 'TX',
  country: 'US',
  postal_code: '78701',
}

describe('versa-cloud-erp transformLocation', () => {
  it('maps id from id field', () => {
    expect(transformLocation(baseRaw).id).toBe('loc-001')
  })

  it('maps name from location_name', () => {
    expect(transformLocation(baseRaw).name).toBe('Main Warehouse')
  })

  it('maps code from location_code', () => {
    expect(transformLocation(baseRaw).code).toBe('MAIN-WH')
  })

  it('hardcodes type to warehouse', () => {
    expect(transformLocation(baseRaw).type).toBe('warehouse')
  })

  it('maps isActive from is_active', () => {
    expect(transformLocation(baseRaw).isActive).toBe(true)
    expect(transformLocation({ ...baseRaw, is_active: false }).isActive).toBe(false)
  })

  it('maps address from address fields', () => {
    const result = transformLocation(baseRaw)
    expect(result.address?.line1).toBe('123 Industrial Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('maps parentLocationId from parent_location_id', () => {
    const result = transformLocation({ ...baseRaw, parent_location_id: 'loc-000' })
    expect(result.parentLocationId).toBe('loc-000')
  })

  it('sets address undefined when no address fields present', () => {
    const result = transformLocation({
      ...baseRaw,
      address_line1: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      postal_code: undefined,
    })
    expect(result.address).toBeUndefined()
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformLocation(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(baseRaw))).not.toThrow()
  })
})
