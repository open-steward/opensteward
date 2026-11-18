import { describe, it, expect } from 'vitest'
import { transformStockLevelsFromVariant } from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/stock-level'
import type { RawInventoryPlannerVariant } from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/product'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('inventory-planner transformStockLevelsFromVariant', () => {
  const rawWithWarehouses: RawInventoryPlannerVariant = {
    _id: 'abc123def456',
    sku: 'SKU-001',
    warehouses: {
      'US Warehouse': { in_stock: 50, on_order: 10, reorder_point: 5, replenishment: 20 },
      'UK Warehouse': { in_stock: 30, on_order: 5 },
    },
  }

  it('returns one StockLevel per warehouse', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    expect(results).toHaveLength(2)
  })

  it('maps id as variantId:warehouseName', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    const usLevel = results.find((r) => r.locationId === 'US Warehouse')
    expect(usLevel?.id).toBe('abc123def456:US Warehouse')
  })

  it('maps productId from variant _id', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    expect(results[0]!.productId).toBe('abc123def456')
  })

  it('maps quantityOnHand from warehouse in_stock', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    const usLevel = results.find((r) => r.locationId === 'US Warehouse')
    expect(usLevel?.quantityOnHand).toBe(50)
  })

  it('maps quantityIncoming from warehouse on_order', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    const usLevel = results.find((r) => r.locationId === 'US Warehouse')
    expect(usLevel?.quantityIncoming).toBe(10)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    const usLevel = results.find((r) => r.locationId === 'US Warehouse')
    expect(usLevel?.reorderPoint).toBe(5)
    expect(usLevel?.reorderQuantity).toBe(20)
  })

  it('sets platform to inventory-planner', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    expect(results[0]!.platform).toBe('inventory-planner')
  })

  it('falls back to global location when no warehouses', () => {
    const raw: RawInventoryPlannerVariant = {
      _id: 'xyz789',
      sku: 'SKU-002',
      in_stock: 100,
      on_order: 25,
    }
    const results = transformStockLevelsFromVariant(raw)
    expect(results).toHaveLength(1)
    expect(results[0]!.locationId).toBe('global')
    expect(results[0]!.id).toBe('xyz789:global')
    expect(results[0]!.quantityOnHand).toBe(100)
    expect(results[0]!.quantityIncoming).toBe(25)
  })

  it('produces output that satisfies StockLevelSchema for each level', () => {
    const results = transformStockLevelsFromVariant(rawWithWarehouses)
    for (const result of results) {
      expect(() => StockLevelSchema.parse(result)).not.toThrow()
    }
  })
})
