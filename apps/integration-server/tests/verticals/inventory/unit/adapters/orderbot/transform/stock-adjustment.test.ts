import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawOrderbotStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — orderbot', () => {
  const raw: RawOrderbotStockAdjustment = {
    id: 55,
    location_id: 3,
    reason: 'cycle count',
    status: 'completed',
    lines: [
      {
        product_id: 123,
        delta_quantity: -5,
        counted_quantity: 95,
        notes: 'Missing items from shelf',
      },
    ],
    adjusted_at: '2024-03-01T00:00:00Z',
    adjusted_by: 'Jane Doe',
  }
  const result = transformStockAdjustment(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('55')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('3')
  })

  it('maps reason cycle_count from "cycle count"', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('maps line productId from product_id as string', () => {
    expect(result.lines[0]!.productId).toBe('123')
  })

  it('maps line deltaQuantity from delta_quantity', () => {
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps line countedQuantity', () => {
    expect(result.lines[0]!.countedQuantity).toBe(95)
  })

  it('maps line notes', () => {
    expect(result.lines[0]!.notes).toBe('Missing items from shelf')
  })

  it('maps adjustedAt via toIso', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from adjusted_by', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — orderbot reason mapping', () => {
  const cases: Array<[string, string]> = [
    ['damage', 'damage'],
    ['theft', 'theft'],
    ['lost item', 'lost'],
    ['found item', 'found'],
    ['expiration', 'expiration'],
    ['correction', 'correction'],
    ['unknown reason', 'other'],
  ]

  for (const [reason, expected] of cases) {
    it(`maps reason "${reason}" → "${expected}"`, () => {
      const raw: RawOrderbotStockAdjustment = {
        id: 1,
        location_id: 1,
        reason,
        adjusted_at: '2024-03-01T00:00:00Z',
        lines: [],
      }
      const result = transformStockAdjustment(raw)
      expect(result.reason).toBe(expected)
    })
  }
})

describe('transformStockAdjustment — orderbot fallbacks', () => {
  const raw: RawOrderbotStockAdjustment = {
    id: 77,
    distribution_center_id: 9,
    reason_code: 'damage',
    line_items: [{ sku: 'SKU-X', quantity_delta: 10 }],
    date: '2024-03-01T00:00:00Z',
    user_name: 'Bob',
  }
  const result = transformStockAdjustment(raw)

  it('falls back to distribution_center_id for locationId', () => {
    expect(result.locationId).toBe('9')
  })

  it('falls back to line_items when lines absent', () => {
    expect(result.lines).toHaveLength(1)
  })

  it('falls back to quantity_delta when delta_quantity absent', () => {
    expect(result.lines[0]!.deltaQuantity).toBe(10)
  })

  it('falls back to date for adjustedAt', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to user_name for adjustedBy', () => {
    expect(result.adjustedBy).toBe('Bob')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
