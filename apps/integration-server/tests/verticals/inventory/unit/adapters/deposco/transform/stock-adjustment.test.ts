import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawDeposcoAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('deposco transformStockAdjustment', () => {
  const raw: RawDeposcoAdjustment = {
    adjustmentNumber: 'DEP-ADJ-001',
    facilityNumber: 'FAC-001',
    reason: 'CYCLE COUNT',
    status: 'POSTED',
    lines: [
      {
        itemNumber: 'DEP-SKU-001',
        quantityAdjusted: -4,
        quantityCounted: 96,
        notes: 'shrinkage detected',
      },
    ],
    adjustmentDate: '2024-03-01T00:00:00Z',
    createdBy: 'carol',
  }

  it('maps id and externalId from adjustmentNumber', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('DEP-ADJ-001')
    expect(result.externalId).toBe('DEP-ADJ-001')
  })

  it('maps locationId from facilityNumber', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('FAC-001')
  })

  it('maps reason "CYCLE COUNT" to cycle_count', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason "damage" keyword to damage', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'damaged product' })
    expect(result.reason).toBe('damage')
  })

  it('maps reason "error" keyword to correction', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'data entry error' })
    expect(result.reason).toBe('correction')
  })

  it('maps reason "found" to found', () => {
    const result = transformStockAdjustment({ ...raw, reason: 'found items' })
    expect(result.reason).toBe('found')
  })

  it('maps lines correctly', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DEP-SKU-001')
    expect(result.lines[0].deltaQuantity).toBe(-4)
    expect(result.lines[0].countedQuantity).toBe(96)
    expect(result.lines[0].notes).toBe('shrinkage detected')
  })

  it('maps adjustedAt from adjustmentDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to epoch when adjustmentDate absent', () => {
    const result = transformStockAdjustment({ adjustmentNumber: 'DEP-ADJ-002' })
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps adjustedBy from createdBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('carol')
  })

  it('sets platform to deposco', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
