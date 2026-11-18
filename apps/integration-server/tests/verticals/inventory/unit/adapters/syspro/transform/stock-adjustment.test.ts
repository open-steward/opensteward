import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSysproStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

function makeRaw(overrides: Partial<RawSysproStockAdjustment> = {}): RawSysproStockAdjustment {
  return {
    Journal: 'J12345',
    EntryDate: '2024-03-01T00:00:00Z',
    TransactionDate: '2024-03-01T00:00:00Z',
    Warehouse: 'WH01',
    StockCode: 'WIDGET-RED',
    MovementQty: -10,
    MovementType: 'ADJ',
    Reference: 'Quarterly correction',
    Operator: 'admin',
    Lot: '',
    SourceJournal: 'SJ001',
    ...overrides,
  }
}

describe('transformStockAdjustment (syspro)', () => {
  it('maps id and externalId from Journal', () => {
    const result = transformStockAdjustment(makeRaw({ Journal: 'J12345' }))
    expect(result.id).toBe('J12345')
    expect(result.externalId).toBe('J12345')
  })

  it('maps locationId from Warehouse', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.locationId).toBe('WH01')
  })

  it('maps MovementType "ADJ" → reason "correction"', () => {
    const result = transformStockAdjustment(makeRaw({ MovementType: 'ADJ' }))
    expect(result.reason).toBe('correction')
  })

  it('maps MovementType "CNT" → reason "cycle_count"', () => {
    const result = transformStockAdjustment(makeRaw({ MovementType: 'CNT' }))
    expect(result.reason).toBe('cycle_count')
  })

  it('maps MovementType "SCR" → reason "damage"', () => {
    const result = transformStockAdjustment(makeRaw({ MovementType: 'SCR' }))
    expect(result.reason).toBe('damage')
  })

  it('creates a single line from StockCode and MovementQty', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WIDGET-RED')
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
    expect(result.lines[0]!.notes).toBe('Quarterly correction')
  })

  it('produces empty lines when StockCode is absent', () => {
    const result = transformStockAdjustment(makeRaw({ StockCode: undefined }))
    expect(result.lines).toEqual([])
  })

  it('maps adjustedAt from TransactionDate as ISO string', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from Operator', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.adjustedBy).toBe('admin')
  })

  it('platform is "syspro"', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes StockAdjustmentSchema validation', () => {
    const result = transformStockAdjustment(makeRaw())
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
