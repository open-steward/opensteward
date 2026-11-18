import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawGofrugalStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('gofrugal transformStockTransfer', () => {
  const raw: RawGofrugalStockTransfer = {
    transferId: 77,
    transferNumber: 'TR-2024-001',
    fromLocationId: 1,
    toLocationId: 2,
    status: 'IN TRANSIT',
    shippedAt: '2024-03-01T00:00:00Z',
    receivedAt: '2024-03-05T00:00:00Z',
    lines: [{ itemId: 101, quantity: 20, receivedQty: 20 }],
  }

  it('maps id and externalId from transferId as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps fromLocationId and toLocationId as strings', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('1')
    expect(result.toLocationId).toBe('2')
  })

  it('maps IN TRANSIT status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps COMPLETED status', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps lines correctly', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(20)
  })

  it('maps shippedAt ISO date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back fromLocationId and toLocationId to empty string when absent', () => {
    const result = transformStockTransfer({
      transferId: 1,
      fromLocationId: undefined,
      toLocationId: undefined,
    })
    expect(result.fromLocationId).toBe('')
    expect(result.toLocationId).toBe('')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
