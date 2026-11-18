import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOrderbotLocation,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation — orderbot', () => {
  const raw: RawOrderbotLocation = {
    id: 7,
    name: 'East Coast DC',
    code: 'EC-DC',
    short_code: 'ECDC',
    address1: '100 Commerce Blvd',
    address2: 'Unit 3',
    city: 'Newark',
    state: 'NJ',
    country: 'US',
    postal_code: '07102',
    active: true,
  }
  const result = transformLocation(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('7')
  })

  it('maps name from raw.name', () => {
    expect(result.name).toBe('East Coast DC')
  })

  it('maps code preferring raw.code over short_code', () => {
    expect(result.code).toBe('EC-DC')
  })

  it('hardcodes type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps isActive from boolean active field', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps address.line1 from address1', () => {
    expect(result.address?.line1).toBe('100 Commerce Blvd')
  })

  it('maps address.city', () => {
    expect(result.address?.city).toBe('Newark')
  })

  it('maps address.country', () => {
    expect(result.address?.country).toBe('US')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — orderbot inactive via status', () => {
  const raw: RawOrderbotLocation = {
    id: '99',
    name: 'Closed Warehouse',
    status: 'inactive',
  }
  const result = transformLocation(raw)

  it('maps isActive false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves address undefined when no address fields', () => {
    expect(result.address).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformLocation — orderbot numeric string active', () => {
  const raw: RawOrderbotLocation = {
    id: 5,
    name: 'Test DC',
    active: '1',
  }
  const result = transformLocation(raw)

  it('parses active from string "1" as true', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
