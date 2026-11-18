import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSageX3StockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('sage-x3-inventory transformStockAdjustment', () => {
  const raw: RawSageX3StockAdjustment = {
    VCRNUM: 'ADJ-001',
    STOFCY: 'PARIS',
    VCRDAT: '2024-03-01T00:00:00Z',
    VCRSTA: '2',
    ADJREA: 'INVCOUNT',
    USRNAM: 'jdoe',
    INVADJ_L: [
      {
        ITMREF: 'WK-2026',
        ADJQTY: -5,
        CNTQTY: 95,
        ITMDES: 'Count discrepancy',
      },
    ],
  }

  it('maps id from VCRNUM', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('ADJ-001')
  })

  it('maps locationId from STOFCY', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('PARIS')
  })

  it('ADJREA "INVCOUNT" → reason cycle_count (contains "inv")', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('ADJREA "damage" → reason damage', () => {
    const result = transformStockAdjustment({ ...raw, ADJREA: 'damage' })
    expect(result.reason).toBe('damage')
  })

  it('ADJREA "adj" → reason correction', () => {
    const result = transformStockAdjustment({ ...raw, ADJREA: 'adj' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines from INVADJ_L', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].countedQuantity).toBe(95)
  })

  it('maps lines from parallel arrays when INVADJ_L absent', () => {
    const { INVADJ_L, ...rest } = raw
    const parallelRaw: RawSageX3StockAdjustment = {
      ...rest,
      INVADJ_ITMREF: ['WK-2026'],
      INVADJ_ADJQTY: [10],
      INVADJ_CNTQTY: [110],
    }
    const result = transformStockAdjustment(parallelRaw)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].deltaQuantity).toBe(10)
  })

  it('maps adjustedBy from USRNAM', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('maps adjustedAt from VCRDAT', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
