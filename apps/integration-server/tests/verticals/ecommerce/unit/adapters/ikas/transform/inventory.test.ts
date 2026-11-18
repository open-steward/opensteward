import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawIkasVariantStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawIkasVariantStock> = {}): RawIkasVariantStock {
  return {
    stockCount: 42,
    stockLocationId: 'loc-istanbul',
    ...overrides,
  }
}

describe('transformInventoryLevel (ikas)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeStock(), 'var-001')
    expect(result.id).toBe('var-001:loc-istanbul')
  })

  it('maps variantId from parameter', () => {
    const result = transformInventoryLevel(makeStock(), 'var-001')
    expect(result.variantId).toBe('var-001')
  })

  it('maps locationId from stockLocationId', () => {
    const result = transformInventoryLevel(makeStock(), 'var-001')
    expect(result.locationId).toBe('loc-istanbul')
  })

  it('maps available from stockCount', () => {
    const result = transformInventoryLevel(makeStock(), 'var-001')
    expect(result.available).toBe(42)
  })

  it('falls back to "default" locationId when stockLocationId is null', () => {
    const result = transformInventoryLevel(makeStock({ stockLocationId: null }), 'var-001')
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('var-001:default')
  })

  it('falls back to available=0 when stockCount is null', () => {
    const result = transformInventoryLevel(makeStock({ stockCount: null }), 'var-001')
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw, 'var-001')
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
