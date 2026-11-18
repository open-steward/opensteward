import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawZidLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawZidLocation> = {}): RawZidLocation {
  return {
    id: 1,
    name: 'Riyadh Warehouse',
    slug: 'riyadh-warehouse',
    address: 'King Fahd Road, Riyadh',
    ...overrides,
  }
}

describe('transformLocation (Zid)', () => {
  it('uses numeric id as string id', () => {
    const result = transformLocation(makeLocation({ id: 1 }))
    expect(result.id).toBe('1')
  })

  it('falls back to slug when id is absent', () => {
    const result = transformLocation(makeLocation({ id: undefined, slug: 'jeddah-wh' }))
    expect(result.id).toBe('jeddah-wh')
  })

  it('falls back to name when id and slug are absent', () => {
    const result = transformLocation(
      makeLocation({ id: undefined, slug: undefined, name: 'Default' }),
    )
    expect(result.id).toBe('Default')
  })

  it('maps name field', () => {
    const result = transformLocation(makeLocation())
    expect(result.name).toBe('Riyadh Warehouse')
  })

  it('falls back to string id for name when name is absent', () => {
    const result = transformLocation(makeLocation({ name: undefined }))
    expect(result.name).toBe('1')
  })

  it('always sets active to true', () => {
    const result = transformLocation(makeLocation())
    expect(result.active).toBe(true)
  })

  it('always sets isFulfillmentCenter to true', () => {
    const result = transformLocation(makeLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('stores raw in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
