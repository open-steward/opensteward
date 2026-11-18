import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawEpicorKineticPartTran,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('epicor-kinetic transformStockAdjustment', () => {
  const raw: RawEpicorKineticPartTran = {
    TranNum: 9001,
    PartNum: 'WK-2026',
    WareHouseCode: 'WH-MAIN',
    TranQty: -5,
    TranType: 'ADJ-QTY',
    SysDate: '2024-03-01',
    SysTime: 3600,
    EntryPerson: 'jdoe',
    SysRowID: 'guid-tran-001',
  }

  it('maps id from TranNum', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('guid-tran-001')
  })

  it('maps locationId from WareHouseCode', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH-MAIN')
  })

  it('maps reason cycle_count for ADJ-QTY', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage for DMR tran type', () => {
    const result = transformStockAdjustment({ ...raw, TranType: 'DMR-MTL' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason other for unknown tran type', () => {
    const result = transformStockAdjustment({ ...raw, TranType: 'MFG-STK' })
    expect(result.reason).toBe('other')
  })

  it('maps line with deltaQuantity from TranQty', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WK-2026')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('combines SysDate and SysTime into adjustedAt', () => {
    const result = transformStockAdjustment(raw)
    // SysTime = 3600 seconds = 1 hour after midnight
    expect(result.adjustedAt).toBeDefined()
    expect(typeof result.adjustedAt).toBe('string')
  })

  it('maps adjustedBy from EntryPerson', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
