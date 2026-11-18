import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  DEFAULT_LOCATION_ID,
  type RawQuickbutikVariantStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawQuickbutikVariantStock> = {}): RawQuickbutikVariantStock {
  return {
    id: 55,
    qty: '5',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('synthesises composite id as {productId}:{variantId}:{DEFAULT_LOCATION_ID}', () => {
    const result = transformInventoryLevel(makeStock({ id: 55 }), '10')
    expect(result.id).toBe(`10:55:${DEFAULT_LOCATION_ID}`)
  })

  it('sets variantId as {productId}:{rawId}', () => {
    const result = transformInventoryLevel(makeStock({ id: 55 }), '10')
    expect(result.variantId).toBe('10:55')
  })

  it('sets locationId to DEFAULT_LOCATION_ID', () => {
    const result = transformInventoryLevel(makeStock(), '10')
    expect(result.locationId).toBe(DEFAULT_LOCATION_ID)
    expect(result.locationId).toBe('default')
  })

  it('converts qty string to integer available', () => {
    const result = transformInventoryLevel(makeStock({ qty: '5' }), '1')
    expect(result.available).toBe(5)
  })

  it('defaults null qty to available:0', () => {
    const result = transformInventoryLevel(makeStock({ qty: null }), '1')
    expect(result.available).toBe(0)
  })

  it('defaults undefined qty to available:0', () => {
    const result = transformInventoryLevel(makeStock({ qty: undefined }), '1')
    expect(result.available).toBe(0)
  })

  it('clamps negative qty to 0', () => {
    const result = transformInventoryLevel(makeStock({ qty: '-3' }), '1')
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw, '1')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock(), '10')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
