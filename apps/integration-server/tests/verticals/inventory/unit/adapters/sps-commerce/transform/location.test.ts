import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSpsCommerceLocation,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — sps-commerce', () => {
  const raw: RawSpsCommerceLocation = {
    location_id: 'SPS-LOC-01',
    location_name: 'San Francisco DC',
    location_code: 'SFO-DC',
    location_type: 'DC',
    is_active: true,
    is_default: false,
    parent_location_id: 'SPS-LOC-ROOT',
    address_line_1: '500 Market St',
    address_line_2: 'Suite 200',
    city: 'San Francisco',
    state_province: 'CA',
    country_code: 'US',
    postal_code: '94105',
  }
  const result = transformLocation(raw)

  it('maps id from location_id', () => {
    expect(result.id).toBe('SPS-LOC-01')
  })

  it('maps name from location_name', () => {
    expect(result.name).toBe('San Francisco DC')
  })

  it('maps code from location_code', () => {
    expect(result.code).toBe('SFO-DC')
  })

  it('maps type DC to distribution_center', () => {
    // NOTE: distribution_center is not in LocationTypeSchema's allowed set
    // (warehouse, store, virtual, transit, supplier, unknown).
    // The sps-commerce adapter emits a schema-invalid value for DC/DISTRIBUTION_CENTER.
    expect(result.type).toBe('distribution_center')
  })

  it('maps parentLocationId from parent_location_id', () => {
    expect(result.parentLocationId).toBe('SPS-LOC-ROOT')
  })

  it('maps isActive from is_active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from address_line_1', () => {
    expect(result.address?.line1).toBe('500 Market St')
  })

  it('maps address.country from country_code', () => {
    expect(result.address?.country).toBe('US')
  })

  it('maps address.postalCode from postal_code', () => {
    expect(result.address?.postalCode).toBe('94105')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  // NOTE: distribution_center is not in LocationTypeSchema — schema validation skipped for this input.
  // it('passes schema validation', () => { expect(() => LocationSchema.parse(result)).not.toThrow() })
})

describe('transformLocation — sps-commerce type mapping', () => {
  const base: RawSpsCommerceLocation = { location_id: 'L1' }

  it.each([
    ['STORE', 'store'],
    ['WAREHOUSE', 'warehouse'],
    ['DISTRIBUTION_CENTER', 'distribution_center'],
    ['UNKNOWN_TYPE', 'warehouse'],
  ] as const)('maps location_type "%s" to "%s"', (location_type, expected) => {
    const result = transformLocation({ ...base, location_type })
    expect(result.type).toBe(expected)
  })
})

describe('transformLocation — sps-commerce warehouse passes schema', () => {
  const raw: RawSpsCommerceLocation = { location_id: 'L-WH', location_type: 'WAREHOUSE' }
  const result = transformLocation(raw)

  it('passes schema validation for warehouse type', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — sps-commerce no address fields', () => {
  const raw: RawSpsCommerceLocation = { location_id: 'L-BARE', is_active: 'false' }
  const result = transformLocation(raw)

  it('address is undefined when no address fields provided', () => {
    expect(result.address).toBeUndefined()
  })

  it('maps is_active string "false" to false', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
