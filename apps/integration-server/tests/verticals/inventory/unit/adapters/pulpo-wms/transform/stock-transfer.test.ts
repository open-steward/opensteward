import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawPulpoWmsStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('pulpo-wms transformStockTransfer', () => {
  const raw: RawPulpoWmsStockTransfer = {
    id: 'tr-001',
    number: 'TR-1042',
    reference: 'REF-TR-001',
    from_warehouse_id: 'wh-001',
    to_warehouse_id: 'wh-002',
    status: 'in_transit',
    lines: [
      {
        product_id: 'prod-001',
        quantity: 50,
        quantity_received: 45,
      },
    ],
    shipped_at: '2024-03-01T00:00:00Z',
    received_at: '2024-03-05T00:00:00Z',
  }

  it('maps id, fromLocationId, toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('tr-001')
    expect(result.fromLocationId).toBe('wh-001')
    expect(result.toLocationId).toBe('wh-002')
  })

  it('maps number and falls back to reference', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-1042')

    const noNumber = transformStockTransfer({ ...raw, number: undefined })
    expect(noNumber.number).toBe('REF-TR-001')
  })

  it('maps status values correctly', () => {
    expect(transformStockTransfer({ ...raw, status: 'draft' }).status).toBe('draft')
    expect(transformStockTransfer({ ...raw, status: 'in_transit' }).status).toBe('in_transit')
    expect(transformStockTransfer({ ...raw, status: 'shipped' }).status).toBe('in_transit')
    expect(transformStockTransfer({ ...raw, status: 'in transit' }).status).toBe('in_transit')
    expect(transformStockTransfer({ ...raw, status: 'completed' }).status).toBe('completed')
    expect(transformStockTransfer({ ...raw, status: 'received' }).status).toBe('completed')
    expect(transformStockTransfer({ ...raw, status: 'cancelled' }).status).toBe('cancelled')
    expect(transformStockTransfer({ ...raw, status: 'voided' }).status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(45)
  })

  it('maps shippedAt and receivedAt as ISO strings', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
