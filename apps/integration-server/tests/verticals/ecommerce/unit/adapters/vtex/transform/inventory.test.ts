import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformInventoryLevels,
  type RawVtexWarehouseBalance,
  type RawVtexInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeBalance(overrides: Partial<RawVtexWarehouseBalance> = {}): RawVtexWarehouseBalance {
  return {
    warehouseId: 'WH-SP-01',
    warehouseName: 'São Paulo Warehouse',
    totalQuantity: 100,
    reservedQuantity: 20,
    hasUnlimitedQuantity: false,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('composes id as {skuId}:{warehouseId}', () => {
    const result = transformInventoryLevel(makeBalance(), 'SKU-001')
    expect(result.id).toBe('SKU-001:WH-SP-01')
  })

  it('maps variantId and locationId', () => {
    const result = transformInventoryLevel(makeBalance(), 'SKU-001')
    expect(result.variantId).toBe('SKU-001')
    expect(result.locationId).toBe('WH-SP-01')
  })

  it('computes available as totalQuantity - reservedQuantity', () => {
    const result = transformInventoryLevel(makeBalance(), 'SKU-001')
    expect(result.available).toBe(80)
  })

  it('clamps available to 0 when reserved exceeds total', () => {
    const result = transformInventoryLevel(
      makeBalance({ totalQuantity: 5, reservedQuantity: 10 }),
      'SKU-001',
    )
    expect(result.available).toBe(0)
  })

  it('sets available to 9_999_999 when hasUnlimitedQuantity is true', () => {
    const result = transformInventoryLevel(makeBalance({ hasUnlimitedQuantity: true }), 'SKU-001')
    expect(result.available).toBe(9_999_999)
  })

  it('defaults totalQuantity and reservedQuantity to 0 when null', () => {
    const result = transformInventoryLevel(
      makeBalance({ totalQuantity: null, reservedQuantity: null }),
      'SKU-001',
    )
    expect(result.available).toBe(0)
  })

  it('preserves raw balance in metadata', () => {
    const raw = makeBalance()
    const result = transformInventoryLevel(raw, 'SKU-001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeBalance(), 'SKU-001')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformInventoryLevels', () => {
  function makeInventory(overrides: Partial<RawVtexInventory> = {}): RawVtexInventory {
    return {
      skuId: 'SKU-001',
      balance: [
        makeBalance(),
        makeBalance({ warehouseId: 'WH-RJ-01', totalQuantity: 50, reservedQuantity: 5 }),
      ],
      ...overrides,
    }
  }

  it('returns one InventoryLevel per balance entry', () => {
    const result = transformInventoryLevels(makeInventory())
    expect(result).toHaveLength(2)
    expect(result[0]!.locationId).toBe('WH-SP-01')
    expect(result[1]!.locationId).toBe('WH-RJ-01')
  })

  it('returns empty array when balance is missing', () => {
    const result = transformInventoryLevels({ skuId: 'SKU-001', balance: undefined })
    expect(result).toEqual([])
  })

  it('returns empty array when balance is empty', () => {
    const result = transformInventoryLevels({ skuId: 'SKU-001', balance: [] })
    expect(result).toEqual([])
  })

  it('propagates skuId to each level as variantId', () => {
    const result = transformInventoryLevels(makeInventory())
    for (const level of result) {
      expect(level.variantId).toBe('SKU-001')
    }
  })
})
