import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawEccangStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('eccang transformStockLevel', () => {
  const raw: RawEccangStockLevel = {
    goods_id: 2001,
    sku_id: 3001,
    goods_no: 'GN-2001',
    sku_no: 'SKU-3001',
    warehouse_id: 101,
    warehouse_code: 'SZ-MAIN',
    stock_qty: 500,
    available_qty: 450,
    lock_qty: 50,
    on_way_qty: 100,
    reorder_point: 80,
    reorder_qty: 200,
    last_count_time: '2024-03-01T00:00:00.000Z',
  }

  it('maps productId from sku_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('3001')
  })

  it('falls back to goods_id as string for productId when sku_id absent', () => {
    const result = transformStockLevel({ ...raw, sku_id: undefined })
    expect(result.productId).toBe('2001')
  })

  it('maps locationId from warehouse_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('101')
  })

  it('falls back to warehouse_code for locationId when warehouse_id absent', () => {
    const result = transformStockLevel({ ...raw, warehouse_id: undefined })
    expect(result.locationId).toBe('SZ-MAIN')
  })

  it('computes composite id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('3001:101')
  })

  it('maps quantityOnHand from stock_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(500)
  })

  it('defaults quantityOnHand to 0 when stock_qty absent', () => {
    const result = transformStockLevel({ ...raw, stock_qty: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable from available_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(450)
  })

  it('maps quantityCommitted from lock_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(50)
  })

  it('maps quantityIncoming from on_way_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint from reorder_point', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(80)
  })

  it('maps reorderQuantity from reorder_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from last_count_time', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores goodsNo and skuNo in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata.goodsNo).toBe('GN-2001')
    expect(result.metadata.skuNo).toBe('SKU-3001')
  })

  it('sets platform to eccang', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
