import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawGoDaddyLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

/** Fields from the `Location` reference (https://developer.godaddy.com/docs/references/rest/catalog/inventory/queries/location). */
function makeLocation(overrides: Partial<RawGoDaddyLocation> = {}): RawGoDaddyLocation {
  return {
    id: 'LOCATION_ID',
    name: 'main-warehouse',
    label: 'Main warehouse',
    status: 'ACTIVE',
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-28T11:30:00.000Z',
    ...overrides,
  }
}

describe('transformLocation (GoDaddy Location → Location)', () => {
  it('parses against the canonical LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeLocation()))).not.toThrow()
  })

  it('maps id, display label and ACTIVE status', () => {
    const l = transformLocation(makeLocation())
    expect(l.id).toBe('LOCATION_ID')
    expect(l.name).toBe('Main warehouse')
    expect(l.active).toBe(true)
    expect(l.address).toBeUndefined()
  })

  it('INACTIVE and ARCHIVED locations are not active', () => {
    expect(transformLocation(makeLocation({ status: 'INACTIVE' })).active).toBe(false)
    expect(transformLocation(makeLocation({ status: 'ARCHIVED' })).active).toBe(false)
  })

  it('names a location without a label by its name', () => {
    expect(transformLocation(makeLocation({ label: null })).name).toBe('main-warehouse')
  })
})
