import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawFulfilStockAdjustment,
  type RawFulfilInventoryLine,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — fulfil-io with explicit lines', () => {
  const raw: RawFulfilStockAdjustment = {
    id: 300,
    location: [5, 'Main Storage'],
    state: 'done',
    date: '2024-03-01T00:00:00Z',
    employee: [8, 'Alice Smith'],
  }
  const lines: RawFulfilInventoryLine[] = [
    { id: 1, product: [55, 'Widget'], expected_quantity: 100, quantity: 90 },
    { id: 2, product: [56, 'Gadget'], expected_quantity: 50, quantity: 55 },
  ]
  const result = transformStockAdjustment(raw, lines)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('300')
  })

  it('maps locationId from location m2o id', () => {
    expect(result.locationId).toBe('5')
  })

  it('always sets reason to cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('computes deltaQuantity as quantity - expected_quantity', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-10)
    expect(result.lines[1]?.deltaQuantity).toBe(5)
  })

  it('maps countedQuantity from quantity', () => {
    expect(result.lines[0]?.countedQuantity).toBe(90)
  })

  it('maps productId from product m2o id', () => {
    expect(result.lines[0]?.productId).toBe('55')
  })

  it('maps adjustedAt from date', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from employee m2o name', () => {
    expect(result.adjustedBy).toBe('Alice Smith')
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — fulfil-io inline lines', () => {
  const lines: RawFulfilInventoryLine[] = [
    { id: 3, product: [57, 'Thing'], expected_quantity: 20, quantity: 20 },
  ]
  const raw: RawFulfilStockAdjustment = {
    id: 301,
    location: [5, 'Storage'],
    date: '2024-03-01T00:00:00Z',
    lines,
  }
  const result = transformStockAdjustment(raw)

  it('uses inline lines when no explicit lines argument', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.deltaQuantity).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — fulfil-io missing date fallback', () => {
  const raw: RawFulfilStockAdjustment = { id: 302, location: [1, 'L'] }
  const result = transformStockAdjustment(raw)

  it('falls back adjustedAt to epoch when date absent', () => {
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
