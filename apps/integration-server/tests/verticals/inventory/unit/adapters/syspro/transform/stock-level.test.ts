import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSysproStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

function makeRaw(overrides: Partial<RawSysproStockLevel> = {}): RawSysproStockLevel {
  return {
    StockCode: 'WIDGET-RED',
    Warehouse: 'WH01',
    QtyOnHand: 200,
    QtyAllocated: 30,
    QtyInTransit: 5,
    QtyOnOrder: 100,
    QtyOnBackOrder: 0,
    MinimumQty: 50,
    ReorderQty: 150,
    SafetyStock: 25,
    BinLocation: 'A-01-03',
    LastCountDate: '2024-03-01T00:00:00Z',
    UnitCost: 25,
    ...overrides,
  }
}

describe('transformStockLevel (syspro)', () => {
  it('synthesizes id as <StockCode>:<Warehouse>', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.id).toBe('WIDGET-RED:WH01')
    expect(result.productId).toBe('WIDGET-RED')
    expect(result.locationId).toBe('WH01')
  })

  it('maps quantityOnHand from QtyOnHand', () => {
    const result = transformStockLevel(makeRaw({ QtyOnHand: 200 }))
    expect(result.quantityOnHand).toBe(200)
  })

  it('computes quantityAvailable as QtyOnHand - QtyAllocated', () => {
    const result = transformStockLevel(makeRaw({ QtyOnHand: 200, QtyAllocated: 30 }))
    expect(result.quantityAvailable).toBe(170)
  })

  it('maps quantityCommitted from QtyAllocated', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityCommitted).toBe(30)
  })

  it('maps quantityIncoming from QtyOnOrder', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint from MinimumQty', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderPoint).toBe(50)
  })

  it('maps reorderQuantity from ReorderQty', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderQuantity).toBe(150)
  })

  it('maps lastCountedAt from LastCountDate as ISO string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when QtyOnHand is absent', () => {
    const result = transformStockLevel(makeRaw({ QtyOnHand: undefined }))
    expect(result.quantityOnHand).toBe(0)
  })

  it('quantityAvailable is undefined when either side is absent', () => {
    const result = transformStockLevel(makeRaw({ QtyAllocated: undefined }))
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('platform is "syspro"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
