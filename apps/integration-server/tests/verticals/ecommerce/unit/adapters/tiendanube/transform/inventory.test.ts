import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawTiendanubeInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryLevel(
  overrides: Partial<RawTiendanubeInventoryLevel> = {},
): RawTiendanubeInventoryLevel {
  return {
    variant_id: 200,
    location_id: 5,
    stock: 42,
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Tiendanube)', () => {
  it('synthesizes id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.id).toBe('200:5')
    expect(result.variantId).toBe('200')
    expect(result.locationId).toBe('5')
  })

  it('reads available from stock field', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ stock: 42 }))
    expect(result.available).toBe(42)
  })

  it('prefers available field over stock', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: 10, stock: 42 }))
    expect(result.available).toBe(10)
  })

  it('uses locationId override parameter when provided', () => {
    const result = transformInventoryLevel(
      makeInventoryLevel({ location_id: undefined }),
      'loc-override',
    )
    expect(result.locationId).toBe('loc-override')
    expect(result.id).toBe('200:loc-override')
  })

  it('defaults locationId to unknown when neither param nor raw field present', () => {
    const raw = makeInventoryLevel()
    delete raw.location_id
    const result = transformInventoryLevel(raw)
    expect(result.locationId).toBe('unknown')
  })

  it('defaults available to 0 when stock is null', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ stock: null, available: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt timestamp', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventoryLevel()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
