import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawFulfilStockTransfer,
  type RawFulfilInternalShipmentMove,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — fulfil-io with explicit moves', () => {
  const raw: RawFulfilStockTransfer = {
    id: 500,
    number: 'INT/2024/0001',
    from_location: [10, 'Source WH'],
    to_location: [11, 'Dest WH'],
    state: 'in_progress',
    planned_date: '2024-03-01T00:00:00Z',
    effective_date: '2024-03-01T00:00:00Z',
  }
  const moves: RawFulfilInternalShipmentMove[] = [
    { id: 1, product: [55, 'Widget'], quantity: 30, done_quantity: 25 },
  ]
  const result = transformStockTransfer(raw, moves)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('500')
  })

  it('maps number from raw.number', () => {
    expect(result.number).toBe('INT/2024/0001')
  })

  it('maps fromLocationId from from_location m2o id', () => {
    expect(result.fromLocationId).toBe('10')
  })

  it('maps toLocationId from to_location m2o id', () => {
    expect(result.toLocationId).toBe('11')
  })

  it('maps state "in_progress" to status "in_transit"', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from product m2o id', () => {
    expect(result.lines[0]?.productId).toBe('55')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]?.quantity).toBe(30)
  })

  it('maps line quantityReceived from done_quantity', () => {
    expect(result.lines[0]?.quantityReceived).toBe(25)
  })

  it('maps shippedAt from planned_date', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from effective_date', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — fulfil-io inline moves', () => {
  const moves: RawFulfilInternalShipmentMove[] = [{ id: 2, product: [56, 'Gadget'], quantity: 10 }]
  const raw: RawFulfilStockTransfer = {
    id: 501,
    from_location: [1, 'A'],
    to_location: [2, 'B'],
    state: 'done',
    moves,
  }
  const result = transformStockTransfer(raw)

  it('uses inline moves when no explicit moves argument', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.quantity).toBe(10)
  })

  it('maps state "done" to status "completed"', () => {
    expect(result.status).toBe('completed')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — fulfil-io status mapping', () => {
  const base: RawFulfilStockTransfer = { id: 1, from_location: [1, 'A'], to_location: [2, 'B'] }

  it.each([
    ['draft', 'draft'],
    ['waiting', 'draft'],
    ['assigned', 'in_transit'],
    ['in_progress', 'in_transit'],
    ['done', 'completed'],
    ['cancelled', 'cancelled'],
  ] as const)('maps state "%s" to status "%s"', (state, expected) => {
    const result = transformStockTransfer({ ...base, state })
    expect(result.status).toBe(expected)
  })
})
