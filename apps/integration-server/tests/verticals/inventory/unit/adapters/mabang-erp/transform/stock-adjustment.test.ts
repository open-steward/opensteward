import { describe, it, expect } from 'vitest'
import {
  transformStorageLog,
  type RawMabangStorageLog,
} from '../../../../../../../src/verticals/inventory/adapters/mabang-erp/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('mabang-erp transformStorageLog', () => {
  const raw: RawMabangStorageLog = {
    storageId: '5001',
    stockId: '12345',
    stockSku: 'MB-SKU-001',
    stockName: 'Blue Widget',
    quantity: 10,
    ctype: '1',
    warehouseName: 'Main Warehouse',
    warehouseCode: 'WH-01',
    timeCreated: '2024-03-01T00:00:00Z',
    operName: 'John Doe',
    remark: 'Stock correction',
  }

  it('maps id and externalId from storageId', () => {
    const result = transformStorageLog(raw)
    expect(result.id).toBe('5001')
    expect(result.externalId).toBe('5001')
  })

  it('maps locationId from warehouseCode', () => {
    const result = transformStorageLog(raw)
    expect(result.locationId).toBe('WH-01')
  })

  it('falls back locationId to warehouseName when warehouseCode is absent', () => {
    const result = transformStorageLog({ ...raw, warehouseCode: undefined })
    expect(result.locationId).toBe('Main Warehouse')
  })

  it('creates a single line per log record', () => {
    const result = transformStorageLog(raw)
    expect(result.lines).toHaveLength(1)
  })

  it('maps productId from stockId', () => {
    const result = transformStorageLog(raw)
    expect(result.lines[0].productId).toBe('12345')
  })

  it('keeps deltaQuantity positive for inbound (ctype=1)', () => {
    const result = transformStorageLog(raw)
    expect(result.lines[0].deltaQuantity).toBe(10)
  })

  it('negates deltaQuantity for outbound (ctype=2)', () => {
    const result = transformStorageLog({ ...raw, ctype: '2', quantity: 5 })
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('maps reason to correction when remark contains "correct"', () => {
    const result = transformStorageLog({ ...raw, remark: 'Stock correction' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason to cycle_count when remark contains "count"', () => {
    const result = transformStorageLog({ ...raw, remark: 'cycle count audit' })
    expect(result.reason).toBe('cycle_count')
  })

  it('defaults reason to other when no match', () => {
    const result = transformStorageLog({ ...raw, remark: 'general movement' })
    expect(result.reason).toBe('other')
  })

  it('maps adjustedAt from timeCreated', () => {
    const result = transformStorageLog(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from operName', () => {
    const result = transformStorageLog(raw)
    expect(result.adjustedBy).toBe('John Doe')
  })

  it('sets platform to mabang-erp', () => {
    const result = transformStorageLog(raw)
    expect(result.platform).toBe('mabang-erp')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStorageLog(raw))).not.toThrow()
  })
})
