import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawEasyEcomStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('easyecom transformStockLevel', () => {
  const raw: RawEasyEcomStockLevel = {
    sku: 'SKU-001',
    product_id: 'PROD-001',
    warehouse_id: 42,
    warehouse_name: 'Mumbai Warehouse',
    available_qty: 80,
    total_qty: 100,
    reserved_qty: 20,
    in_transit_qty: 30,
    damaged_qty: 5,
    reorder_point: 25,
    reorder_qty: 50,
    last_updated: '2024-03-01T00:00:00.000Z',
  }

  it('maps productId from product_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('PROD-001')
  })

  it('falls back to sku for productId when product_id absent', () => {
    const result = transformStockLevel({ ...raw, product_id: undefined })
    expect(result.productId).toBe('SKU-001')
  })

  it('maps locationId from warehouse_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('42')
  })

  it('computes composite id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('PROD-001:42')
  })

  it('prefers total_qty over available_qty for quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('falls back to available_qty for quantityOnHand when total_qty absent', () => {
    const result = transformStockLevel({ ...raw, total_qty: undefined })
    expect(result.quantityOnHand).toBe(80)
  })

  it('defaults quantityOnHand to 0 when both total_qty and available_qty absent', () => {
    const result = transformStockLevel({ ...raw, total_qty: undefined, available_qty: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable from available_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(80)
  })

  it('maps quantityCommitted from reserved_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from in_transit_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(30)
  })

  it('maps reorderPoint from reorder_point', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(25)
  })

  it('maps reorderQuantity from reorder_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(50)
  })

  it('maps lastCountedAt from last_updated', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores warehouseName in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata.warehouseName).toBe('Mumbai Warehouse')
  })

  it('sets platform to easyecom', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
