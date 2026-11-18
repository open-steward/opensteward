import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSphereWmsAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — spherewms', () => {
  const raw: RawSphereWmsAdjustment = {
    adjustment_id: 'ADJ-007',
    adjustment_number: 'AN-007',
    location_id: 'LOC-001',
    reason: 'cycle count',
    reason_code: 'CC',
    status: 'posted',
    client_code: 'CLIENT-1',
    created_on: '2024-03-01T00:00:00Z',
    posted_on: '2024-03-01T00:00:00Z',
    adjusted_by: 'Jane Doe',
    items: [
      {
        product_id: 'PROD-42',
        delta_qty: -10,
        counted_qty: 240,
        notes: 'variance found',
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('maps id from adjustment_id', () => {
    expect(result.id).toBe('ADJ-007')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps reason cycle_count from "cycle count"', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from product_id', () => {
    expect(result.lines[0]?.productId).toBe('PROD-42')
  })

  it('maps line deltaQuantity from delta_qty', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
  })

  it('maps line countedQuantity from counted_qty', () => {
    expect(result.lines[0]?.countedQuantity).toBe(240)
  })

  it('maps adjustedAt from posted_on', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from adjusted_by', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — spherewms reason mapping', () => {
  const base: RawSphereWmsAdjustment = { adjustment_id: 'A1', location_id: 'LOC-1' }

  it.each([
    ['damage found', 'damage'],
    ['theft detected', 'theft'],
    ['lost items', 'lost'],
    ['found items', 'found'],
    ['expired', 'expiration'],
    ['correction', 'correction'],
    ['miscellaneous', 'other'],
  ] as const)('maps reason "%s" to "%s"', (reason, expected) => {
    const result = transformStockAdjustment({ ...base, reason })
    expect(result.reason).toBe(expected)
  })
})

describe('transformStockAdjustment — spherewms fallback to id field', () => {
  const raw: RawSphereWmsAdjustment = {
    id: 'ADJ-ALT',
    location_id: 'LOC-002',
    reason: 'other',
    posted_on: '2024-03-01T00:00:00Z',
  }
  const result = transformStockAdjustment(raw)

  it('falls back to id when adjustment_id is absent', () => {
    expect(result.id).toBe('ADJ-ALT')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
