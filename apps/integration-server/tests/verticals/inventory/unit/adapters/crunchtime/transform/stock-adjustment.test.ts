import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawCrunchtimeInventoryAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('crunchtime transformStockAdjustment', () => {
  it('maps adjustmentId to id and externalId', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-2024-001',
      locationCode: 'LOC-001',
      adjustmentDate: '2024-03-01T00:00:00Z',
    }
    const result = transformStockAdjustment(raw)

    expect(result.id).toBe('ADJ-2024-001')
    expect(result.externalId).toBe('ADJ-2024-001')
  })

  it('maps locationCode to locationId', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-001',
      locationCode: 'LOC-042',
    }
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('LOC-042')
  })

  it('maps adjustmentDate to adjustedAt', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-002',
      adjustmentDate: '2024-03-01T00:00:00Z',
    }
    const result = transformStockAdjustment(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.adjustedAt).toContain('2024-03-01')
  })

  it('falls back to epoch when adjustmentDate is absent', () => {
    const raw: RawCrunchtimeInventoryAdjustment = { adjustmentId: 'ADJ-003' }
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('maps reason containing "count" to cycle_count', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-004',
      adjustmentReason: 'Physical Count',
    }
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason containing "damage" to damage', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-005',
      adjustmentReason: 'Product Damage',
    }
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('damage')
  })

  it('maps reason containing "expir" to expiration', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-006',
      adjustmentReason: 'Product Expiration',
    }
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('expiration')
  })

  it('maps reason containing "correct" to correction', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-007',
      adjustmentReason: 'Data Correction',
    }
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('correction')
  })

  it('defaults unknown reason to other', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-008',
      adjustmentReason: 'Miscellaneous',
    }
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('other')
  })

  it('maps adjustmentUser to adjustedBy', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-009',
      adjustmentUser: 'jane.doe',
    }
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jane.doe')
  })

  it('maps adjustment lines correctly', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-010',
      adjustmentLines: [
        {
          productNumber: 'PN-100',
          adjustmentQuantity: -5,
          countedQuantity: 45,
          notes: 'Damaged during delivery',
        },
      ],
    }
    const result = transformStockAdjustment(raw)

    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]!
    expect(line.productId).toBe('PN-100')
    expect(line.deltaQuantity).toBe(-5)
    expect(line.countedQuantity).toBe(45)
    expect(line.notes).toBe('Damaged during delivery')
  })

  it('defaults line deltaQuantity to 0 when adjustmentQuantity is absent', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-011',
      adjustmentLines: [{ productNumber: 'PN-200' }],
    }
    const result = transformStockAdjustment(raw)
    expect(result.lines[0]?.deltaQuantity).toBe(0)
  })

  it('passes StockAdjustmentSchema validation', () => {
    const raw: RawCrunchtimeInventoryAdjustment = {
      adjustmentId: 'ADJ-FULL',
      locationCode: 'LOC-001',
      adjustmentDate: '2024-03-01T00:00:00Z',
      adjustmentReason: 'Physical Count',
      adjustmentUser: 'manager',
      status: 'COMPLETED',
      adjustmentLines: [
        {
          productNumber: 'PN-100',
          adjustmentQuantity: -10,
          countedQuantity: 90,
          notes: 'Cycle count result',
        },
      ],
    }
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
