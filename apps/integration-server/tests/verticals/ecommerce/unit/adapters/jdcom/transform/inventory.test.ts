import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawJdStockInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawJdStockInfo> = {}): RawJdStockInfo {
  return {
    sku_id: 10086001,
    ware_id: 50001,
    stock_num: 150,
    locked_num: 25,
    outer_id: 'SELLER-SKU-001',
    modified: '2024-03-20 14:00:00',
    ...overrides,
  }
}

describe('transformInventoryLevel (JD.com)', () => {
  it('uses sku_id:jd-default as the canonical id', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('10086001:jd-default')
    expect(result.variantId).toBe('10086001')
    expect(result.locationId).toBe('jd-default')
  })

  it('maps stock_num to available', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.available).toBe(150)
  })

  it('maps locked_num to committed', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.committed).toBe(25)
  })

  it('computes onHand as available + committed', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.onHand).toBe(175)
  })

  it('handles missing locked_num (no committed)', () => {
    const result = transformInventoryLevel(makeStock({ locked_num: undefined }))
    expect(result.committed).toBeUndefined()
    expect(result.onHand).toBeUndefined()
  })

  it('defaults available to 0 when stock_num is missing', () => {
    const result = transformInventoryLevel(makeStock({ stock_num: undefined }))
    expect(result.available).toBe(0)
  })

  it('converts modified timestamp to ISO string', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.metadata['sku_id']).toBe(10086001)
    expect(result.metadata['outer_id']).toBe('SELLER-SKU-001')
  })
})
