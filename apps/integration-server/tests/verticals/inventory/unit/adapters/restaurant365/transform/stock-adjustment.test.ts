import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawR365AdjustmentTransaction,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('restaurant365 transformStockAdjustment', () => {
  const raw: RawR365AdjustmentTransaction = {
    transactionId: 'txn-guid-adj-001',
    transactionNumber: 'ADJ-001',
    name: 'Inventory Count - March',
    type: 'Inventory Count',
    locationId: 'loc-guid-001',
    date: '2024-03-01T00:00:00Z',
    createdBy: 'chef',
    isApproved: true,
    lines: [
      {
        transactionDetailId: 'detail-guid-001',
        itemId: 'item-guid-001',
        adjustment: -5,
        quantity: 45,
        comment: 'post-service count',
      },
    ],
  }

  it('maps transactionId to id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('txn-guid-adj-001')
    expect(result.externalId).toBe('txn-guid-adj-001')
  })

  it('maps locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('loc-guid-001')
  })

  it('maps "Inventory Count" type to cycle_count reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps type strings to reasons', () => {
    expect(transformStockAdjustment({ ...raw, type: 'Damage Write-Off' }).reason).toBe('damage')
    expect(transformStockAdjustment({ ...raw, type: 'Waste Disposal' }).reason).toBe('expiration')
    expect(transformStockAdjustment({ ...raw, type: 'Inventory Adjustment' }).reason).toBe(
      'correction',
    )
    expect(transformStockAdjustment({ ...raw, type: 'Other' }).reason).toBe('other')
  })

  it('maps line items with deltaQuantity and countedQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-guid-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
    expect(result.lines[0]!.countedQuantity).toBe(45)
    expect(result.lines[0]!.notes).toBe('post-service count')
  })

  it('maps adjustedAt from date', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from createdBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('chef')
  })

  it('falls back adjustedAt to epoch when date is absent', () => {
    const result = transformStockAdjustment({ ...raw, date: undefined })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
