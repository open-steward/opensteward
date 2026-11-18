import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSkuNexusStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('skunexus transformStockTransfer', () => {
  const raw: RawSkuNexusStockTransfer = {
    id: 'TR-1',
    transfer_number: 'TRF-2024-001',
    from_location_id: 'LOC-A',
    to_location_id: 'LOC-B',
    status: 'in_transit',
    line_items: [
      {
        id: 'LI-1',
        product_id: 'PROD-1',
        quantity: 20,
        quantity_received: 10,
      },
    ],
    shipped_at: '2024-03-01T00:00:00Z',
    received_at: '2024-03-05T00:00:00Z',
  }

  it('maps id, number, fromLocationId, toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TR-1')
    expect(result.number).toBe('TRF-2024-001')
    expect(result.fromLocationId).toBe('LOC-A')
    expect(result.toLocationId).toBe('LOC-B')
    expect(result.platform).toBe('skunexus')
  })

  it('maps status "in_transit" to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status "shipped" to "in_transit"', () => {
    const result = transformStockTransfer({ ...raw, status: 'shipped' })
    expect(result.status).toBe('in_transit')
  })

  it('maps status "completed" to "completed"', () => {
    const result = transformStockTransfer({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('maps status "voided" to "cancelled"', () => {
    const result = transformStockTransfer({ ...raw, status: 'voided' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items: productId, quantity, quantityReceived', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('PROD-1')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(10)
  })

  it('maps shippedAt and receivedAt as ISO strings', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
