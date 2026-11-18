import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawLightspeedInventoryRecord,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('lightspeed-inventory transformStockLevel', () => {
  const raw: RawLightspeedInventoryRecord = {
    id: 'inv-001',
    product_id: 'prod-abc',
    outlet_id: 'outlet-xyz',
    current_amount: 42,
    reorder_point: 5,
    restock_level: 20,
    average_cost: 9.99,
    attributed_cost: 419.58,
    version: 3,
  }

  it('maps id from id field', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('inv-001')
  })

  it('maps productId from product_id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-abc')
  })

  it('maps locationId from outlet_id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('outlet-xyz')
  })

  it('maps quantityOnHand from current_amount', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(42)
  })

  it('maps reorderPoint from reorder_point', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(5)
  })

  it('maps reorderQuantity from restock_level', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(20)
  })

  it('defaults quantityOnHand to 0 when current_amount is absent', () => {
    const result = transformStockLevel({ ...raw, current_amount: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
