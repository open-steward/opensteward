import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawGocodesLocation,
} from '../../../../../../../src/verticals/inventory/adapters/gocodes/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — gocodes', () => {
  const raw: RawGocodesLocation = {
    id: 'loc-001',
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    parent_id: 'loc-000',
    active: true,
    address1: '100 Market St',
    address2: 'Suite 5',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    zip: '94105',
  }
  const result = transformLocation(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('loc-001')
  })

  it('maps name', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code', () => {
    expect(result.code).toBe('WH-MAIN')
  })

  it('sets type to warehouse (hardcoded)', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from parent_id', () => {
    expect(result.parentLocationId).toBe('loc-000')
  })

  it('maps isActive from boolean active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from address1', () => {
    expect(result.address?.line1).toBe('100 Market St')
  })

  it('maps address.city', () => {
    expect(result.address?.city).toBe('San Francisco')
  })

  it('maps address.postalCode from zip', () => {
    expect(result.address?.postalCode).toBe('94105')
  })

  it('sets platform to gocodes', () => {
    expect(result.platform).toBe('gocodes')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — gocodes inactive string active', () => {
  const raw: RawGocodesLocation = {
    id: 'loc-002',
    active: 'false',
  }
  const result = transformLocation(raw)

  it('maps isActive: false from string "false"', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves address undefined when no address fields', () => {
    expect(result.address).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — gocodes defaults when active absent', () => {
  const raw: RawGocodesLocation = { id: 'loc-003' }
  const result = transformLocation(raw)

  it('defaults isActive to true when active is absent', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
