import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawDatapelStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('datapel transformStockAdjustment', () => {
  const raw: RawDatapelStockAdjustment = {
    adjustmentid: 300,
    locationid: 42,
    locationname: 'Sydney Warehouse',
    reason: 'stocktake',
    status: 'Posted',
    adjustdate: '2024-03-01T00:00:00Z',
    username: 'alice',
    userid: 7,
    lines: [
      {
        basestockid: 101,
        itemcode: 'WIDGET-001',
        delta: -3,
        countedqty: 97,
        notes: 'counted fewer than expected',
      },
    ],
  }

  it('maps id and externalId from adjustmentid', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps locationId from locationid', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps reason stocktake to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason damage keyword to damage', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'damaged items' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason error keyword to correction', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'data entry error' })
    expect(result.reason).toBe('correction')
  })

  it('maps lines with deltaQuantity from delta field', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('101')
    expect(result.lines[0].deltaQuantity).toBe(-3)
    expect(result.lines[0].countedQuantity).toBe(97)
    expect(result.lines[0].notes).toBe('counted fewer than expected')
  })

  it('falls back to adjustqty when delta is absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      lines: [{ basestockid: 101, adjustqty: 5 }],
    })
    expect(result.lines[0].deltaQuantity).toBe(5)
  })

  it('maps adjustedAt from adjustdate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when no date fields present', () => {
    const result = transformStockAdjustment({ adjustmentid: 999 })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from username', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('alice')
  })

  it('sets platform to datapel', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
