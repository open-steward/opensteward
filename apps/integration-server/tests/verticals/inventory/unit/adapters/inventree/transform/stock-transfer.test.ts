import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawInvenTreeStockTracking,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — inventree tracking entry', () => {
  const raw: RawInvenTreeStockTracking = {
    pk: 300,
    item: 42,
    date: '2024-03-01T00:00:00Z',
    tracking_type: 1,
    label: 'Transfer',
    notes: 'Moved to secondary warehouse',
    user: 3,
    deltas: {
      location: { prev: 5, new: 9 },
      quantity: { prev: 20, new: 20 },
    },
  }
  const result = transformStockTransfer(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('300')
  })

  it('sets fromLocationId from deltas.location.prev', () => {
    expect(result.fromLocationId).toBe('5')
  })

  it('sets toLocationId from deltas.location.new', () => {
    expect(result.toLocationId).toBe('9')
  })

  it('always maps status to completed', () => {
    expect(result.status).toBe('completed')
  })

  it('sets productId in line from item', () => {
    expect(result.lines[0]?.productId).toBe('42')
  })

  it('sets quantity from deltas.quantity.new', () => {
    expect(result.lines[0]?.quantity).toBe(20)
  })

  it('sets shippedAt and receivedAt from date', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — missing location deltas', () => {
  const raw: RawInvenTreeStockTracking = {
    pk: 301,
    item: 10,
    date: '2024-03-01T00:00:00Z',
    tracking_type: 1,
    deltas: {
      location: { prev: null, new: null },
      quantity: { prev: 5, new: 5 },
    },
  }
  const result = transformStockTransfer(raw)

  it('sets fromLocationId to empty string when prev is null', () => {
    expect(result.fromLocationId).toBe('')
  })

  it('sets toLocationId to empty string when new is null', () => {
    expect(result.toLocationId).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
