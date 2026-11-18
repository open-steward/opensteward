import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawNoonStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawNoonStockItem> = {}): RawNoonStockItem {
  return {
    sku: 'SKU-BUDS-BLK',
    seller_sku: 'SELLER-BUDS-BLK',
    warehouse_id: 'WH-DXB-01',
    available_quantity: 200,
    reserved_quantity: 15,
    total_quantity: 215,
    updated_at: '2024-07-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Noon)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('SKU-BUDS-BLK:WH-DXB-01')
    expect(result.variantId).toBe('SKU-BUDS-BLK')
    expect(result.locationId).toBe('WH-DXB-01')
    expect(result.available).toBe(200)
    expect(result.committed).toBe(15)
    expect(result.onHand).toBe(215)
    expect(result.updatedAt).toBe('2024-07-01T08:00:00Z')
  })

  it('uses noon-default location when warehouse_id is absent', () => {
    const result = transformInventoryLevel(makeStock({ warehouse_id: undefined }))
    expect(result.locationId).toBe('noon-default')
    expect(result.id).toBe('SKU-BUDS-BLK:noon-default')
  })

  it('falls back to seller_sku when sku is absent', () => {
    const result = transformInventoryLevel(makeStock({ sku: undefined }))
    expect(result.variantId).toBe('SELLER-BUDS-BLK')
  })

  it('handles zero stock gracefully', () => {
    const result = transformInventoryLevel(
      makeStock({ available_quantity: 0, reserved_quantity: 0, total_quantity: 0 }),
    )
    expect(result.available).toBe(0)
    expect(result.committed).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('computes onHand from available + committed when total_quantity is absent', () => {
    const result = transformInventoryLevel(
      makeStock({ total_quantity: undefined }),
    )
    expect(result.onHand).toBe(215) // 200 + 15
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['sku']).toBe('SKU-BUDS-BLK')
    expect(result.metadata['warehouse_id']).toBe('WH-DXB-01')
  })
})
