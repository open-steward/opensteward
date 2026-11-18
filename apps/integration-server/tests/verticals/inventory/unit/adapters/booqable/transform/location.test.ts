import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawBooqableLocation,
} from '../../../../../../../src/verticals/inventory/adapters/booqable/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('booqable transformLocation', () => {
  const raw: RawBooqableLocation = {
    id: 'loc-001',
    type: 'locations',
    attributes: {
      id: 'loc-001',
      name: 'Main Warehouse',
      address: '123 Main St',
      city: 'Amsterdam',
      region: 'NH',
      country: 'NL',
      zipcode: '1011',
      phone: '+31201234567',
      email: 'warehouse@example.com',
      archived: false,
      main_address: {
        address1: '123 Main St',
        address2: 'Unit 2',
        city: 'Amsterdam',
        region: 'NH',
        country: 'NL',
        zipcode: '1011',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and externalId from resource id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('loc-001')
    expect(result.externalId).toBe('loc-001')
  })

  it('maps name from attributes.name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields from main_address', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('Amsterdam')
    expect(result.address?.country).toBe('NL')
    expect(result.address?.postalCode).toBe('1011')
  })

  it('sets isActive to true when archived is false', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when archived is true', () => {
    const archived: RawBooqableLocation = {
      ...raw,
      attributes: { ...raw.attributes, archived: true },
    }
    const result = transformLocation(archived)
    expect(result.isActive).toBe(false)
  })

  it('sets platform to booqable', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('booqable')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
