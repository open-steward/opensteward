import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawTrendyolStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawTrendyolStockItem> = {}): RawTrendyolStockItem {
  return {
    barcode: '8690000000001',
    quantity: 25,
    lastModifiedDate: 1704067200000, // 2024-01-01T00:00:00.000Z
    ...overrides,
  }
}

describe('transformInventoryLevel (Trendyol)', () => {
  it('maps id as barcode:default and variantId from barcode', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('8690000000001:default')
    expect(result.variantId).toBe('8690000000001')
  })

  it('maps locationId to synthetic default', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.locationId).toBe('default')
  })

  it('maps available quantity from quantity field', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.available).toBe(25)
  })

  it('clamps negative quantity to 0', () => {
    const result = transformInventoryLevel(makeStock({ quantity: -5 }))
    expect(result.available).toBe(0)
  })

  it('defaults to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeStock({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('converts epoch ms updatedAt to ISO string', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.updatedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
