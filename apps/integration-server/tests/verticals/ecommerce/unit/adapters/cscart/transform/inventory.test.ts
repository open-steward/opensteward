import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type CsCartStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/cscart/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockItem(overrides: Partial<CsCartStockItem> = {}): CsCartStockItem {
  return {
    product_id: 42,
    amount: 100,
    timestamp: 1700000000,
    updated_timestamp: 1704067200,
    ...overrides,
  }
}

function makeCombinationStockItem(
  overrides: Partial<CsCartStockItem> = {},
): CsCartStockItem {
  return {
    combination_id: 10,
    product_id: 42,
    amount: 15,
    updated_timestamp: 1704067200,
    ...overrides,
  }
}

describe('transformInventoryLevel (CS-Cart)', () => {
  it('synthesises composite id with :default suffix for product', () => {
    const result = transformInventoryLevel(makeStockItem(), '42')
    expect(result.id).toBe('42:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('42')
    expect(result.locationId).toBe('default')
  })

  it('synthesises composite id for combination variant', () => {
    const result = transformInventoryLevel(makeCombinationStockItem(), '42:10')
    expect(result.id).toBe('42:10:default')
    expect(result.variantId).toBe('42:10')
    expect(result.locationId).toBe('default')
  })

  it('maps amount to available', () => {
    const result = transformInventoryLevel(makeStockItem(), '42')
    expect(result.available).toBe(100)
  })

  it('defaults null amount to 0', () => {
    const result = transformInventoryLevel(makeStockItem({ amount: null }), '42')
    expect(result.available).toBe(0)
  })

  it('defaults missing amount to 0', () => {
    const result = transformInventoryLevel(makeStockItem({ amount: undefined }), '42')
    expect(result.available).toBe(0)
  })

  it('parses string amounts correctly', () => {
    const result = transformInventoryLevel(makeStockItem({ amount: '50' }), '42')
    expect(result.available).toBe(50)
  })

  it('prefers updated_timestamp over timestamp for updatedAt', () => {
    const result = transformInventoryLevel(makeStockItem(), '42')
    expect(result.updatedAt).toBe(new Date(1704067200 * 1000).toISOString())
  })

  it('falls back to timestamp when updated_timestamp is absent', () => {
    const result = transformInventoryLevel(
      makeStockItem({ updated_timestamp: undefined }),
      '42',
    )
    expect(result.updatedAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('returns undefined updatedAt when both timestamps are absent', () => {
    const result = transformInventoryLevel(
      makeStockItem({ updated_timestamp: undefined, timestamp: undefined }),
      '42',
    )
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockItem()
    const result = transformInventoryLevel(raw, '42')
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockItem(), '42')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('validates combination-level inventory against InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeCombinationStockItem(), '42:10')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('handles NaN-producing string amounts by defaulting to 0', () => {
    const result = transformInventoryLevel(makeStockItem({ amount: 'abc' }), '42')
    expect(result.available).toBe(0)
  })
})
