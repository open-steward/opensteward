import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawQoblexTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('qoblex transformStockTransfer', () => {
  const raw: RawQoblexTransfer = {
    id: 300,
    source_location: 'loc-42',
    destination_location: 'loc-99',
    transfer_date: '2024-03-01T00:00:00Z',
  }

  it('stringifies numeric id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('loc-42')
    expect(result.toLocationId).toBe('loc-99')
  })

  it('always sets status to completed', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('always returns empty lines array', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toEqual([])
  })

  it('maps shippedAt from transfer_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
