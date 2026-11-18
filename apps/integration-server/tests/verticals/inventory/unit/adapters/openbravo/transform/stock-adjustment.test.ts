import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawOpenbravoInventoryCount,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('openbravo transformStockAdjustment', () => {
  const raw: RawOpenbravoInventoryCount = {
    id: 'inv-uuid-001',
    documentNo: 'INV-2024-001',
    documentStatus: 'CO',
    name: 'Physical inventory count',
    warehouse: { id: 'wh-001' },
    movementDate: '2024-03-01T00:00:00Z',
    createdBy: { _identifier: 'Jane Doe' },
    materialMgmtInventoryCountLineList: [
      {
        id: 'il-001',
        product: { id: 'prod-001' },
        storageBin: { id: 'bin-001' },
        quantityCount: 240,
        bookQuantity: 250,
        adjustmentQuantity: -10,
        description: 'Physical recount',
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('inv-uuid-001')
    expect(result.externalId).toBe('inv-uuid-001')
  })

  it('maps locationId from warehouse.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('wh-001')
  })

  it('maps reason from name text — "count" → cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" keyword → damage', () => {
    const result = transformStockAdjustment({ ...raw, name: 'damage write-off' })
    expect(result.reason).toBe('damage')
  })

  it('maps lines with productId and explicit adjustmentQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.countedQuantity).toBe(240)
  })

  it('computes deltaQuantity from count - book when adjustmentQuantity absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      materialMgmtInventoryCountLineList: [
        {
          id: 'il-002',
          product: { id: 'prod-002' },
          quantityCount: 230,
          bookQuantity: 250,
        },
      ],
    })
    expect(result.lines[0]!.deltaQuantity).toBe(-20)
  })

  it('maps adjustedAt from movementDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from createdBy._identifier', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to openbravo', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
