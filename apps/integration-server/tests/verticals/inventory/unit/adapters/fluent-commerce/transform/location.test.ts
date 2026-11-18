import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawFluentCommerceLocation,
} from '../../../../../../../src/verticals/inventory/adapters/fluent-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — fluent-commerce', () => {
  const raw: RawFluentCommerceLocation = {
    id: 'internal-99',
    ref: 'WH-SF-01',
    name: 'SF Warehouse',
    type: 'WAREHOUSE',
    status: 'ACTIVE',
    primaryAddress: {
      street: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      postcode: '94105',
      country: 'US',
    },
  }
  const result = transformLocation(raw)

  it('maps id from raw.ref', () => {
    expect(result.id).toBe('WH-SF-01')
  })

  it('maps externalId from raw.id when present', () => {
    expect(result.externalId).toBe('internal-99')
  })

  it('maps name', () => {
    expect(result.name).toBe('SF Warehouse')
  })

  it('maps type WAREHOUSE to "warehouse"', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps isActive: true when status is not INACTIVE', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from primaryAddress.street', () => {
    expect(result.address?.line1).toBe('100 Market St')
  })

  it('maps address.postalCode from primaryAddress.postcode', () => {
    expect(result.address?.postalCode).toBe('94105')
  })

  it('sets platform to fluent-commerce', () => {
    expect(result.platform).toBe('fluent-commerce')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — fluent-commerce type mapping', () => {
  const base: RawFluentCommerceLocation = { ref: 'REF-1' }

  it.each([
    ['STORE', 'store'],
    ['WAREHOUSE', 'warehouse'],
    ['DC', 'warehouse'],
    ['DEPOT', 'warehouse'],
    ['VIRTUAL', 'virtual'],
    ['UNKNOWN', 'warehouse'],
  ] as const)('maps type "%s" to "%s"', (type, expected) => {
    const result = transformLocation({ ...base, type })
    expect(result.type).toBe(expected)
  })
})

describe('transformLocation — fluent-commerce INACTIVE', () => {
  const raw: RawFluentCommerceLocation = { ref: 'OLD-LOC', status: 'INACTIVE' }
  const result = transformLocation(raw)

  it('maps isActive: false when status is INACTIVE', () => {
    expect(result.isActive).toBe(false)
  })

  it('uses ref as externalId when id is absent', () => {
    expect(result.externalId).toBe('OLD-LOC')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
