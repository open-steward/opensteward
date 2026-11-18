import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/prediko/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — prediko SKU_LOCATION', () => {
  const raw = {
    sku_id: 'sku_001',
    sku_name: 'WK-2026',
    warehouse_id: 'wh_abc123',
    warehouse_name: 'Main Warehouse',
    sum_stock_level: 150,
    sum_incoming_units: 50,
    days_on_hand: 30,
  }
  const result = transformStockLevel(raw)

  it('sets id as productId:locationId', () => {
    expect(result.id).toBe('sku_001:wh_abc123')
  })

  it('sets productId from sku_id', () => {
    expect(result.productId).toBe('sku_001')
  })

  it('sets locationId from warehouse_id', () => {
    expect(result.locationId).toBe('wh_abc123')
  })

  it('sets quantityOnHand from sum_stock_level', () => {
    expect(result.quantityOnHand).toBe(150)
  })

  it('sets quantityIncoming from sum_incoming_units', () => {
    expect(result.quantityIncoming).toBe(50)
  })

  it('leaves quantityAvailable undefined (not available in Prediko SKU_LOCATION response)', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('leaves quantityCommitted undefined (not available in Prediko SKU_LOCATION response)', () => {
    expect(result.quantityCommitted).toBeUndefined()
  })

  it('stores warehouseName in metadata', () => {
    expect(result.metadata['warehouseName']).toBe('Main Warehouse')
  })

  it('stores daysOnHand in metadata', () => {
    expect(result.metadata['daysOnHand']).toBe('30')
  })

  it('sets platform to prediko', () => {
    expect(result.platform).toBe('prediko')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — id/locationId fallback to name fields', () => {
  const result = transformStockLevel({
    sku_name: 'WK-2026',
    warehouse_name: 'Main Warehouse',
    sum_stock_level: 10,
  })

  it('falls back productId to sku_name when sku_id absent', () => {
    expect(result.productId).toBe('WK-2026')
  })

  it('falls back locationId to warehouse_name when warehouse_id absent', () => {
    expect(result.locationId).toBe('Main Warehouse')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — minimal input', () => {
  const result = transformStockLevel({})

  it('defaults quantityOnHand to 0 when sum_stock_level absent', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('leaves quantityIncoming undefined when sum_incoming_units absent', () => {
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
