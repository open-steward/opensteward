import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawVendInventory,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const baseRaw: RawVendInventory = {
  id: 'inv-composite-uuid-001',
  product_id: 'prod-uuid-001',
  outlet_id: 'outlet-uuid-001',
  count: 250,
  available: 240,
  on_order: 50,
  reorder_point: 30,
  reorder_amount: 100,
  average_cost: 14.99,
}

describe('vend-pos transformStockLevel', () => {
  it('maps id from composite id field', () => {
    expect(transformStockLevel(baseRaw).id).toBe('inv-composite-uuid-001')
  })

  it('builds synthetic id when id is absent', () => {
    const result = transformStockLevel({ ...baseRaw, id: undefined })
    expect(result.id).toBe('prod-uuid-001:outlet-uuid-001')
  })

  it('maps productId from product_id', () => {
    expect(transformStockLevel(baseRaw).productId).toBe('prod-uuid-001')
  })

  it('maps locationId from outlet_id', () => {
    expect(transformStockLevel(baseRaw).locationId).toBe('outlet-uuid-001')
  })

  it('maps quantityOnHand from count', () => {
    expect(transformStockLevel(baseRaw).quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from available', () => {
    expect(transformStockLevel(baseRaw).quantityAvailable).toBe(240)
  })

  it('maps quantityIncoming from on_order', () => {
    expect(transformStockLevel(baseRaw).quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from reorder_point', () => {
    expect(transformStockLevel(baseRaw).reorderPoint).toBe(30)
  })

  it('maps reorderQuantity from reorder_amount', () => {
    expect(transformStockLevel(baseRaw).reorderQuantity).toBe(100)
  })

  it('sets platform to vend-pos', () => {
    expect(transformStockLevel(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(baseRaw))).not.toThrow()
  })
})
