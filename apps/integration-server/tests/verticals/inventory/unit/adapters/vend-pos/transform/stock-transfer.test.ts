import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawVendOutletConsignment,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const baseRaw: RawVendOutletConsignment = {
  id: 'transfer-uuid-001',
  name: 'TR-2024-001',
  source_outlet_id: 'outlet-uuid-001',
  outlet_id: 'outlet-uuid-002',
  status: 'SENT',
  consignment_date: '2024-03-01T00:00:00Z',
  received_at: '2024-03-05T00:00:00Z',
  consignment_products: [
    { product_id: 'prod-uuid-001', sku: 'WK-2026', count: 20, received: 20, cost: 14.99 },
  ],
}

describe('vend-pos transformStockTransfer', () => {
  it('maps id from id field', () => {
    expect(transformStockTransfer(baseRaw).id).toBe('transfer-uuid-001')
  })

  it('maps number from name', () => {
    expect(transformStockTransfer(baseRaw).number).toBe('TR-2024-001')
  })

  it('maps fromLocationId from source_outlet_id', () => {
    expect(transformStockTransfer(baseRaw).fromLocationId).toBe('outlet-uuid-001')
  })

  it('maps toLocationId from outlet_id', () => {
    expect(transformStockTransfer(baseRaw).toLocationId).toBe('outlet-uuid-002')
  })

  it('maps status SENT to in_transit', () => {
    expect(transformStockTransfer(baseRaw).status).toBe('in_transit')
  })

  it('maps status OPEN to draft', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'OPEN' }).status).toBe('draft')
  })

  it('maps status RECEIVED to completed', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'RECEIVED' }).status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'CANCELLED' }).status).toBe('cancelled')
  })

  it('maps lines with productId and quantity', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-uuid-001')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(20)
  })

  it('maps shippedAt from consignment_date', () => {
    expect(transformStockTransfer(baseRaw).shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from received_at', () => {
    expect(transformStockTransfer(baseRaw).receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to vend-pos', () => {
    expect(transformStockTransfer(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(baseRaw))).not.toThrow()
  })
})
