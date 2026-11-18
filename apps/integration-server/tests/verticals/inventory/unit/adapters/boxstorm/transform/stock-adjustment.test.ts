import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawBoxstormStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('boxstorm transformStockAdjustment', () => {
  const raw: RawBoxstormStockAdjustment = {
    id: 300,
    locationId: 5,
    locationName: 'Main Warehouse',
    reason: 'Cycle Count',
    dateCreated: '2024-03-01T00:00:00Z',
    createdBy: 'jdoe',
    lines: [
      {
        partId: 101,
        partNumber: 'WDG-001',
        quantityChange: -3,
        quantity: 97,
        notes: 'Recount after discrepancy',
      },
    ],
  }

  it('maps id and externalId as string from numeric id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps locationId from numeric locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('5')
  })

  it('falls back to locationName when locationId is absent', () => {
    const result = transformStockAdjustment({ ...raw, locationId: undefined })
    expect(result.locationId).toBe('Main Warehouse')
  })

  it('maps cycle_count reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps damage reason', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'Damage' })
    expect(result.reason).toBe('damage')
  })

  it('maps theft reason', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'Theft' })
    expect(result.reason).toBe('theft')
  })

  it('maps line items', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.deltaQuantity).toBe(-3)
    expect(result.lines[0]!.countedQuantity).toBe(97)
  })

  it('maps adjustedAt from dateCreated', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from createdBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('sets platform to boxstorm', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
