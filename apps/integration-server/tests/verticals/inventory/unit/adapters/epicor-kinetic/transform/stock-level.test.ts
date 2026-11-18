import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawEpicorKineticPartWhse,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('epicor-kinetic transformStockLevel', () => {
  const raw: RawEpicorKineticPartWhse = {
    PartNum: 'WK-2026',
    WarehouseCode: 'WH-MAIN',
    OnHandQty: 100,
    ReservedQty: 10,
    OrderedQty: 50,
    MinimumQty: 20,
    MaximumQty: 200,
    NonNettable: 5,
    SysRowID: 'guid-wh-sl-001',
  }

  it('maps id as productId:locationId composite', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('WK-2026:WH-MAIN')
  })

  it('maps productId from PartNum', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('WK-2026')
  })

  it('maps locationId from WarehouseCode', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH-MAIN')
  })

  it('maps quantityOnHand from OnHandQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('computes quantityAvailable as onHand minus reserved', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90)
  })

  it('maps quantityCommitted from ReservedQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from OrderedQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from MinimumQty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps reorderQuantity from MaximumQty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(200)
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
