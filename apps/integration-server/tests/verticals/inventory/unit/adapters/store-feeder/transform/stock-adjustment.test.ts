import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawStoreFeederInventoryLog,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — store-feeder', () => {
  const raw: RawStoreFeederInventoryLog = {
    LogID: 9001,
    ProductID: 12345,
    WarehouseID: 101,
    StockLocationID: 201,
    QuantityBefore: 250,
    QuantityAfter: 240,
    Delta: -10,
    Reason: 'StockTake',
    ReasonDescription: 'Cycle count variance',
    UpdatedDate: '2024-03-01T00:00:00Z',
    User: 'Jane Doe',
  }
  const result = transformStockAdjustment(raw)

  it('maps id from LogID as string', () => {
    expect(result.id).toBe('9001')
  })

  it('maps locationId from StockLocationID (preferred over WarehouseID)', () => {
    expect(result.locationId).toBe('201')
  })

  it('maps reason StockTake / cycle count to cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('builds a single line with productId from ProductID', () => {
    expect(result.lines[0]?.productId).toBe('12345')
  })

  it('maps line deltaQuantity from Delta', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
  })

  it('maps line countedQuantity from QuantityAfter', () => {
    expect(result.lines[0]?.countedQuantity).toBe(240)
  })

  it('maps line notes from ReasonDescription', () => {
    expect(result.lines[0]?.notes).toBe('Cycle count variance')
  })

  it('maps adjustedAt from UpdatedDate', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from User', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — store-feeder WarehouseID fallback', () => {
  const raw: RawStoreFeederInventoryLog = {
    LogID: 9002,
    ProductID: 999,
    WarehouseID: 101,
    QuantityBefore: 100,
    QuantityAfter: 90,
    Reason: 'Damage',
    UpdatedDate: '2024-03-01T00:00:00Z',
    UserName: 'Bob',
  }
  const result = transformStockAdjustment(raw)

  it('falls back locationId to WarehouseID when StockLocationID absent', () => {
    expect(result.locationId).toBe('101')
  })

  it('derives delta from QuantityAfter - QuantityBefore when Delta absent', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
  })

  it('maps reason Damage to damage', () => {
    expect(result.reason).toBe('damage')
  })

  it('falls back adjustedBy to UserName', () => {
    expect(result.adjustedBy).toBe('Bob')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
