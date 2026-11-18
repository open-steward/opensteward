import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSapEwmPhysInvItem,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('sap-ewm transformStockAdjustment', () => {
  const raw: RawSapEwmPhysInvItem = {
    PhysicalInventoryDocument: 'PI-001',
    FiscalYear: '2024',
    PhysicalInventoryItem: '0001',
    EWMWarehouse: 'WH01',
    EWMStorageType: 'HIGH',
    EWMStorageBin: 'A-01-01',
    Product: 'MAT-001',
    Batch: 'BATCH-01',
    CountedQuantityInBaseUnit: 95,
    BookQuantityInBaseUnit: 100,
    QuantityDifferenceInBaseUnit: -5,
    PhysicalInventoryType: 'CC',
    PostingDate: '2024-03-01T00:00:00Z',
    LastChangedByUser: 'jdoe',
  }

  it('maps id as PhysicalInventoryDocument:FiscalYear:PhysicalInventoryItem', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('PI-001:2024:0001')
  })

  it('maps locationId as EWMWarehouse:EWMStorageType:EWMStorageBin when bin present', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH01:HIGH:A-01-01')
  })

  it('falls back locationId to EWMWarehouse when bin absent', () => {
    const result = transformStockAdjustment({ ...raw, EWMStorageBin: undefined })
    expect(result.locationId).toBe('WH01')
  })

  it('maps reason cycle_count for PhysicalInventoryType CC', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('uses QuantityDifferenceInBaseUnit as delta when available', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('computes delta as counted - book when QuantityDifference absent', () => {
    const result = transformStockAdjustment({ ...raw, QuantityDifferenceInBaseUnit: undefined })
    expect(result.lines[0].deltaQuantity).toBe(-5) // 95 - 100
  })

  it('maps countedQuantity from CountedQuantityInBaseUnit', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(95)
  })

  it('maps product from Product field on line', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('MAT-001')
  })

  it('includes batch in line notes when Batch present', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toContain('BATCH-01')
  })

  it('maps adjustedAt from PostingDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from LastChangedByUser', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('platform is sap-ewm', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
