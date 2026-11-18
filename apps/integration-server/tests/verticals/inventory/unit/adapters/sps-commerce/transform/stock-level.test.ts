import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSpsCommerceStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — sps-commerce', () => {
  const raw: RawSpsCommerceStockLevel = {
    inventory_id: 'INV-SPS-001',
    item_id: 'SPS-ITEM-01',
    buyer_item_number: 'BUY-001',
    location_id: 'LOC-001',
    quantity_on_hand: 250,
    quantity_available: 240,
    quantity_committed: 10,
    quantity_on_order: 100,
    reorder_point: 50,
    reorder_quantity: 200,
    last_count_date: '2024-03-01T00:00:00Z',
    report_date: '2024-03-01',
  }
  const result = transformStockLevel(raw)

  it('uses inventory_id as id when present', () => {
    expect(result.id).toBe('INV-SPS-001')
  })

  it('maps productId from item_id', () => {
    expect(result.productId).toBe('SPS-ITEM-01')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps quantityOnHand from quantity_on_hand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from quantity_available', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from quantity_committed', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from quantity_on_order', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint from reorder_point', () => {
    expect(result.reorderPoint).toBe(50)
  })

  it('maps reorderQuantity from reorder_quantity', () => {
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from last_count_date', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores buyer item number in metadata', () => {
    expect(result.metadata['buyerItemNumber']).toBe('BUY-001')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — sps-commerce synthetic id fallback', () => {
  const raw: RawSpsCommerceStockLevel = {
    item_id: 'SPS-ITEM-02',
    location_id: 'LOC-002',
    quantity_on_hand: 0,
  }
  const result = transformStockLevel(raw)

  it('builds synthetic id as item_id:location_id when no inventory_id', () => {
    expect(result.id).toBe('SPS-ITEM-02:LOC-002')
  })

  it('defaults quantityOnHand to 0', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
