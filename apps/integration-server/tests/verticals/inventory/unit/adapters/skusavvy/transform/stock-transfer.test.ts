import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSkusavvyStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('skusavvy transformStockTransfer', () => {
  const raw: RawSkusavvyStockTransfer = {
    id: 'tr-01',
    transferNumber: 'TRF-2024-001',
    fromLocationId: 'loc-A',
    toLocationId: 'loc-B',
    status: 'shipped',
    lineItems: [{ productId: 'prod-01', quantity: 20, quantityReceived: 10 }],
    shippedAt: '2024-03-01T00:00:00Z',
    completedAt: '2024-03-05T00:00:00Z',
  }

  it('maps id, number, fromLocationId, toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('tr-01')
    expect(result.number).toBe('TRF-2024-001')
    expect(result.fromLocationId).toBe('loc-A')
    expect(result.toLocationId).toBe('loc-B')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps status "shipped" to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status "completed" to "completed"', () => {
    const result = transformStockTransfer({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const result = transformStockTransfer({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-01')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(10)
  })

  it('maps shippedAt from shippedAt and receivedAt from completedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    // skusavvy maps completedAt → receivedAt (not a raw receivedAt field)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
