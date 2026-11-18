import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSumtrackerLocation,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

function makeRaw(overrides: Partial<RawSumtrackerLocation> = {}): RawSumtrackerLocation {
  return {
    id: 42,
    name: 'Main Warehouse',
    code: 'MAIN',
    is_default: true,
    is_active: true,
    address_line1: '123 Commerce St',
    address_line2: 'Suite 4',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    zip_code: '78701',
    ...overrides,
  }
}

describe('transformLocation (sumtracker)', () => {
  it('maps id and externalId from numeric raw.id', () => {
    const result = transformLocation(makeRaw({ id: 7 }))
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name and code', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Main Warehouse')
    expect(result.code).toBe('MAIN')
  })

  it('type is always "warehouse"', () => {
    const result = transformLocation(makeRaw())
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields when address_line1 is present', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeDefined()
    expect(result.address!.line1).toBe('123 Commerce St')
    expect(result.address!.city).toBe('Austin')
    expect(result.address!.country).toBe('US')
    expect(result.address!.postalCode).toBe('78701')
  })

  it('omits address when no address fields are set', () => {
    const result = transformLocation(
      makeRaw({
        address_line1: undefined,
        address_line2: undefined,
        city: undefined,
        country: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('isActive defaults to true when is_active is absent', () => {
    const result = transformLocation(makeRaw({ is_active: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when is_active is false', () => {
    const result = transformLocation(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('platform is "sumtracker"', () => {
    const result = transformLocation(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
