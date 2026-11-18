import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawStockTrimStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — stocktrim', () => {
  const raw: RawStockTrimStockAdjustment = {
    id: 'ADJ-001',
    locationCode: 'WH-SFO',
    locationName: 'SF Warehouse',
    reason: 'Cycle Count',
    adjustedAt: '2024-03-01T00:00:00Z',
    adjustedBy: 'Jane Doe',
    lines: [
      {
        productId: 'PROD-001',
        deltaQuantity: -10,
        countedQuantity: 240,
        notes: 'variance found',
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('maps id', () => {
    expect(result.id).toBe('ADJ-001')
  })

  it('maps locationId from locationCode', () => {
    expect(result.locationId).toBe('WH-SFO')
  })

  it('maps reason "Cycle Count" to cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId', () => {
    expect(result.lines[0]?.productId).toBe('PROD-001')
  })

  it('maps line deltaQuantity', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
  })

  it('maps line countedQuantity', () => {
    expect(result.lines[0]?.countedQuantity).toBe(240)
  })

  it('maps adjustedAt', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — stocktrim locationName fallback', () => {
  const raw: RawStockTrimStockAdjustment = {
    id: 'ADJ-FB',
    locationName: 'NYC Warehouse',
    reason: 'damage',
    adjustedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformStockAdjustment(raw)

  it('falls back locationId to locationName when locationCode absent', () => {
    expect(result.locationId).toBe('NYC Warehouse')
  })

  it('maps reason damage to damage', () => {
    expect(result.reason).toBe('damage')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
