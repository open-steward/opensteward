import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawKoronaPosOrganizationalUnit,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('korona-pos transformLocation', () => {
  const raw: RawKoronaPosOrganizationalUnit = {
    id: 'ou-uuid-001',
    number: 'WH-001',
    name: 'Central Warehouse',
    active: true,
    warehouse: true,
    parentOrganizationalUnit: { id: 'ou-uuid-000', number: 'HQ' },
    address: {
      addressLine1: '500 Commerce Blvd',
      addressLine2: 'Unit B',
      city: 'Chicago',
      state: 'IL',
      country: 'US',
      zipCode: '60601',
      department: 'Logistics',
    },
    economicZone: { id: 'ez-001', number: 'EZ-MAIN' },
  }

  it('maps id from raw.id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('ou-uuid-001')
    expect(result.externalId).toBe('ou-uuid-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Central Warehouse')
  })

  it('maps code from number', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH-001')
  })

  it('sets type warehouse when warehouse=true', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets type store when warehouse=false', () => {
    const result = transformLocation({ ...raw, warehouse: false })
    expect(result.type).toBe('store')
  })

  it('maps parentLocationId from parentOrganizationalUnit.id', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('ou-uuid-000')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('500 Commerce Blvd')
    expect(result.address?.line2).toBe('Unit B')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.region).toBe('IL')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('60601')
  })

  it('sets isActive true when active=true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when active=false', () => {
    const result = transformLocation({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is missing', () => {
    const result = transformLocation({ id: 'x', active: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to korona-pos', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
