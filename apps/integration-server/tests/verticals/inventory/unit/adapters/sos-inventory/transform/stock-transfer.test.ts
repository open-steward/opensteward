import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSosInventoryStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('sos-inventory transformStockTransfer', () => {
  const raw: RawSosInventoryStockTransfer = {
    id: 400,
    number: 'TRF-2024-001',
    fromLocation: { id: 5, name: 'Seattle Fulfillment' },
    toLocation: { id: 6, name: 'Portland Warehouse' },
    status: 'in transit',
    date: '2024-03-01T00:00:00Z',
    completedDate: '2024-03-05T00:00:00Z',
    lines: [{ item: { id: 99, name: 'Bulk Widget' }, quantity: 30, received: 30 }],
  }

  it('maps id (numeric) as string, number, fromLocationId, toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('400')
    expect(result.number).toBe('TRF-2024-001')
    expect(result.fromLocationId).toBe('5')
    expect(result.toLocationId).toBe('6')
    expect(result.platform).toBe('sos-inventory')
  })

  it('maps status "in transit" to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status "completed" to "completed"', () => {
    const result = transformStockTransfer({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps status "shipped" to "in_transit"', () => {
    const result = transformStockTransfer({ ...raw, status: 'shipped' })
    expect(result.status).toBe('in_transit')
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const result = transformStockTransfer({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items: productId from item.id, quantity, received', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('99')
    expect(result.lines[0]!.quantity).toBe(30)
    expect(result.lines[0]!.quantityReceived).toBe(30)
  })

  it('maps date to shippedAt and completedDate to receivedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
