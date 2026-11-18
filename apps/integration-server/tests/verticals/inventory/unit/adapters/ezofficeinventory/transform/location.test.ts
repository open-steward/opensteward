import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEZOLocation,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — ezofficeinventory', () => {
  const raw: RawEZOLocation = {
    id: 42,
    name: 'Main Warehouse',
    identification_number: 'WH-001',
    status: 'active',
    street1: '123 Main St',
    street2: 'Suite 4',
    city: 'San Francisco',
    state: 'CA',
    zip_code: '94105',
    country: 'US',
    parent_id: 10,
    description: 'Primary storage site',
  }
  const result = transformLocation(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('42')
  })

  it('maps code from identification_number', () => {
    expect(result.code).toBe('WH-001')
  })

  it('sets type to warehouse (hardcoded)', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps isActive from status === "active"', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps parentLocationId from parent_id as string', () => {
    expect(result.parentLocationId).toBe('10')
  })

  it('maps address fields when address data present', () => {
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.postalCode).toBe('94105')
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — ezofficeinventory inactive with no address', () => {
  const raw: RawEZOLocation = {
    id: '99',
    name: 'Archived',
    status: 'inactive',
  }
  const result = transformLocation(raw)

  it('maps isActive false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves address undefined when no address fields', () => {
    expect(result.address).toBeUndefined()
  })

  it('leaves parentLocationId undefined when parent_id is null', () => {
    expect(result.parentLocationId).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — ezofficeinventory defaults', () => {
  const raw: RawEZOLocation = { id: 1 }
  const result = transformLocation(raw)

  it('defaults isActive to true when status is absent', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
