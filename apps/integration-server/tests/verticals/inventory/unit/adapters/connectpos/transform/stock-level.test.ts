import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawConnectposStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/connectpos/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('connectpos transformStockLevel', () => {
  it('constructs composite id from product_id and warehouse_id', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 55,
      warehouse_id: 3,
      qty: 100,
    }
    const result = transformStockLevel(raw)

    expect(result.id).toBe('55:3')
    expect(result.productId).toBe('55')
    expect(result.locationId).toBe('3')
  })

  it('falls back to outlet_id when warehouse_id is absent', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 10,
      outlet_id: 7,
      qty: 20,
    }
    const result = transformStockLevel(raw)

    expect(result.locationId).toBe('7')
    expect(result.id).toBe('10:7')
  })

  it('maps qty to quantityOnHand', () => {
    const raw: RawConnectposStockLevel = { product_id: 1, warehouse_id: 1, qty: 42 }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(42)
  })

  it('falls back to total_qty when qty is absent', () => {
    const raw: RawConnectposStockLevel = { product_id: 1, warehouse_id: 1, total_qty: 30 }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(30)
  })

  it('defaults quantityOnHand to 0 when both qty and total_qty are absent', () => {
    const raw: RawConnectposStockLevel = { product_id: 1, warehouse_id: 1 }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps available_qty to quantityAvailable', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 1,
      warehouse_id: 1,
      qty: 50,
      available_qty: 40,
    }
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(40)
  })

  it('maps qty_to_ship to quantityCommitted', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 1,
      warehouse_id: 1,
      qty_to_ship: 10,
    }
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps qty_ordered to quantityIncoming', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 1,
      warehouse_id: 1,
      qty_ordered: 200,
    }
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(200)
  })

  it('maps notify_stock_qty to reorderPoint', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 1,
      warehouse_id: 1,
      notify_stock_qty: 15,
    }
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(15)
  })

  it('passes StockLevelSchema validation', () => {
    const raw: RawConnectposStockLevel = {
      product_id: 55,
      warehouse_id: 3,
      qty: 100,
      available_qty: 90,
      qty_to_ship: 10,
      qty_ordered: 50,
      notify_stock_qty: 20,
    }
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
