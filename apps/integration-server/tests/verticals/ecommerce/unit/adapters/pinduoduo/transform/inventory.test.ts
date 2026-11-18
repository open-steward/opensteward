import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformInventoryLevels,
  type RawPddSkuStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSkuStock(overrides: Partial<RawPddSkuStock> = {}): RawPddSkuStock {
  return {
    sku_id: '560001',
    outer_id: 'DRESS-RED-M',
    goods_id: '9876543210',
    sku_quantity: 120,    // sellable stock
    lock_quantity: 15,    // locked for pending orders
    incoming_quantity: 30, // en route from supplier
    total_quantity: 135,  // physical (120 + 15)
    update_time: 1704067200, // 2024-01-01T00:00:00Z
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformInventoryLevel (Pinduoduo)', () => {
  it('builds synthetic id as sku_id:locationId', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.id).toBe('560001:pdd-default')
  })

  it('uses warehouse_id as locationId when present', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ warehouse_id: 'WH-GZ-002' }),
    )
    expect(result.id).toBe('560001:WH-GZ-002')
    expect(result.locationId).toBe('WH-GZ-002')
  })

  it('uses pdd-default as locationId when warehouse_id is absent', () => {
    const result = transformInventoryLevel(makeSkuStock({ warehouse_id: undefined }))
    expect(result.locationId).toBe('pdd-default')
  })

  it('sets variantId from sku_id', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.variantId).toBe('560001')
  })

  it('falls back to outer_id as variantId when sku_id is absent', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ sku_id: undefined, outer_id: 'DRESS-RED-M' }),
    )
    expect(result.variantId).toBe('DRESS-RED-M')
  })

  it('maps sku_quantity to available stock', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.available).toBe(120)
  })

  it('maps lock_quantity to committed stock', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.committed).toBe(15)
  })

  it('maps incoming_quantity to incoming stock', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.incoming).toBe(30)
  })

  it('uses total_quantity as onHand when present', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.onHand).toBe(135)
  })

  it('calculates onHand as available + committed when total_quantity is absent', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ total_quantity: undefined }),
    )
    // 120 + 15 = 135
    expect(result.onHand).toBe(135)
  })

  it('leaves onHand undefined when both total_quantity and lock_quantity are absent', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ total_quantity: undefined, lock_quantity: undefined }),
    )
    expect(result.onHand).toBeUndefined()
  })

  it('converts update_time Unix timestamp to ISO updatedAt', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(result.updatedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('leaves updatedAt undefined when update_time is absent', () => {
    const result = transformInventoryLevel(makeSkuStock({ update_time: undefined }))
    expect(result.updatedAt).toBeUndefined()
  })

  it('stores the complete raw stock record in metadata', () => {
    const raw = makeSkuStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['sku_id']).toBe('560001')
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeSkuStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('defaults available to 0 when sku_quantity is absent', () => {
    const result = transformInventoryLevel(makeSkuStock({ sku_quantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('handles zero stock correctly', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ sku_quantity: 0, lock_quantity: 0 }),
    )
    expect(result.available).toBe(0)
    expect(result.committed).toBe(0)
  })

  it('omits committed when lock_quantity is absent', () => {
    const result = transformInventoryLevel(makeSkuStock({ lock_quantity: undefined }))
    expect(result.committed).toBeUndefined()
  })

  it('omits incoming when incoming_quantity is absent', () => {
    const result = transformInventoryLevel(
      makeSkuStock({ incoming_quantity: undefined }),
    )
    expect(result.incoming).toBeUndefined()
  })
})

describe('transformInventoryLevels (Pinduoduo)', () => {
  it('transforms a list of SKU stock records', () => {
    const records = [
      makeSkuStock({ sku_id: '560001', sku_quantity: 120 }),
      makeSkuStock({ sku_id: '560002', sku_quantity: 80 }),
      makeSkuStock({ sku_id: '560003', sku_quantity: 0 }),
    ]
    const result = transformInventoryLevels(records)
    expect(result).toHaveLength(3)
    expect(result[0]!.variantId).toBe('560001')
    expect(result[0]!.available).toBe(120)
    expect(result[1]!.available).toBe(80)
    expect(result[2]!.available).toBe(0)
  })

  it('returns empty array for empty input', () => {
    expect(transformInventoryLevels([])).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(transformInventoryLevels(undefined)).toEqual([])
  })

  it('handles multi-warehouse records with distinct locationIds', () => {
    const records = [
      makeSkuStock({ sku_id: '560001', warehouse_id: 'WH-BJ-001', sku_quantity: 50 }),
      makeSkuStock({ sku_id: '560001', warehouse_id: 'WH-SH-001', sku_quantity: 30 }),
    ]
    const result = transformInventoryLevels(records)
    expect(result[0]!.id).toBe('560001:WH-BJ-001')
    expect(result[1]!.id).toBe('560001:WH-SH-001')
  })
})
