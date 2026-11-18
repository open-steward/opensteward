import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawInforWmsInventoryBalance,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('infor-wms transformStockLevel', () => {
  const raw: RawInforWmsInventoryBalance = {
    itemNumber: 'ITEM-001',
    warehouseId: 'WH-001',
    locationId: 'BIN-A-01',
    onHandQty: 200,
    availableQty: 180,
    allocatedQty: 20,
    incomingQty: 50,
    reorderPoint: 30,
    reorderQty: 100,
    lastCountDate: '2024-03-01T00:00:00Z',
    lotNumber: 'LOT-001',
    uom: 'EA',
  }

  it('maps id as itemNumber:locationId (bin preferred)', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('ITEM-001:BIN-A-01')
  })

  it('maps productId from itemNumber', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('ITEM-001')
  })

  it('uses bin-level locationId when present', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('BIN-A-01')
  })

  it('falls back to warehouseId when locationId absent', () => {
    const result = transformStockLevel({ ...raw, locationId: undefined })
    expect(result.locationId).toBe('WH-001')
    expect(result.id).toBe('ITEM-001:WH-001')
  })

  it('maps quantityOnHand from onHandQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(200)
  })

  it('maps quantityAvailable, quantityCommitted, quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(180)
    expect(result.quantityCommitted).toBe(20)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(30)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from lastCountDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to infor-wms', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
