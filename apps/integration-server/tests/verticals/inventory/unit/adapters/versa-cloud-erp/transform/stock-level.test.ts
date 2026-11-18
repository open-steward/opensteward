import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawVersaStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const baseRaw: RawVersaStockLevel = {
  item_id: 'item-001',
  location_id: 'loc-001',
  location_name: 'Main Warehouse',
  quantity_on_hand: 250,
  quantity_available: 240,
  quantity_committed: 10,
  quantity_on_order: 50,
  reorder_point: 30,
  reorder_quantity: 100,
  last_count_date: '2024-03-01T00:00:00Z',
}

describe('versa-cloud-erp transformStockLevel', () => {
  it('builds composite id from item_id and location_id', () => {
    expect(transformStockLevel(baseRaw).id).toBe('item-001:loc-001')
  })

  it('maps productId from item_id', () => {
    expect(transformStockLevel(baseRaw).productId).toBe('item-001')
  })

  it('maps locationId from location_id', () => {
    expect(transformStockLevel(baseRaw).locationId).toBe('loc-001')
  })

  it('maps quantityOnHand from quantity_on_hand', () => {
    expect(transformStockLevel(baseRaw).quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from quantity_available', () => {
    expect(transformStockLevel(baseRaw).quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from quantity_committed', () => {
    expect(transformStockLevel(baseRaw).quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from quantity_on_order', () => {
    expect(transformStockLevel(baseRaw).quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from reorder_point', () => {
    expect(transformStockLevel(baseRaw).reorderPoint).toBe(30)
  })

  it('maps reorderQuantity from reorder_quantity', () => {
    expect(transformStockLevel(baseRaw).reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from last_count_date', () => {
    expect(transformStockLevel(baseRaw).lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformStockLevel(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(baseRaw))).not.toThrow()
  })
})
