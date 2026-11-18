import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawD365InventJournal,
  type RawD365InventJournalLine,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('dynamics-365-scm transformStockAdjustment', () => {
  const line: RawD365InventJournalLine = {
    JournalNumber: 'JRNL-001',
    LineNumber: 1,
    ItemNumber: 'ITEM-001',
    WarehouseId: 'WH-001',
    Quantity: -5,
    CorrectionQuantity: 45,
    JournalLineDescription: 'Damaged during handling',
  }

  const raw: RawD365InventJournal = {
    JournalNumber: 'JRNL-001',
    JournalType: 'Movement',
    Description: 'damage write-off',
    TransDate: '2024-03-01T00:00:00.000Z',
    CreatedByUserId: 'user@contoso.com',
    DataAreaId: 'USMF',
    JournalPostingStatus: 'Posted',
    InventJournalLines: [line],
  }

  it('maps id and externalId from JournalNumber', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('JRNL-001')
    expect(result.externalId).toBe('JRNL-001')
  })

  it('maps locationId from first line WarehouseId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('WH-001')
  })

  it('maps reason damage from description containing "damage"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason cycle_count from JournalType StockCount', () => {
    const result = transformStockAdjustment({
      ...raw,
      JournalType: 'StockCount',
      Description: undefined,
    })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason correction from description containing "correct"', () => {
    const result = transformStockAdjustment({
      ...raw,
      JournalType: 'Movement',
      Description: 'correct error',
    })
    expect(result.reason).toBe('correction')
  })

  it('maps reason other for unknown description', () => {
    const result = transformStockAdjustment({
      ...raw,
      JournalType: 'Movement',
      Description: 'misc',
    })
    expect(result.reason).toBe('other')
  })

  it('maps line productId from ItemNumber', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line deltaQuantity from Quantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('maps line countedQuantity from CorrectionQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].countedQuantity).toBe(45)
  })

  it('maps line notes from JournalLineDescription', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].notes).toBe('Damaged during handling')
  })

  it('maps adjustedAt from TransDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back adjustedAt to epoch when TransDate is absent', () => {
    const result = transformStockAdjustment({ ...raw, TransDate: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from CreatedByUserId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('user@contoso.com')
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
