import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawJushuitanStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('jushuitan transformStockLevel', () => {
  const raw: RawJushuitanStockLevel = {
    sku_id: 1001,
    i_id: 'SKU-ABC',
    wms_co_id: 42,
    wh_name: 'Shanghai Warehouse',
    qty_enable: 80,
    qty_onhand: 100,
    qty_lock: 15,
    qty_purchase: 50,
    modified: '2024-03-01T00:00:00Z',
  }

  it('builds composite id from productId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('1001:42')
  })

  it('maps productId from sku_id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('1001')
  })

  it('maps locationId from wms_co_id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps quantityOnHand from qty_onhand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable from qty_enable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(80)
  })

  it('maps quantityCommitted from qty_lock', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from qty_purchase', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps lastCountedAt from modified', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when qty_onhand missing', () => {
    const result = transformStockLevel({ sku_id: 1, wms_co_id: 1 })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to jushuitan', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
