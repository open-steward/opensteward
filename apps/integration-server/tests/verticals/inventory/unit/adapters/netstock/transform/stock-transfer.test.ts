import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawNetstockStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/netstock/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('netstock transformStockTransfer', () => {
  const raw: RawNetstockStockTransfer = {
    id: 'trn-001',
    transferNumber: 'TRF-2024-001',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    status: 'SHIPPED',
    shippedAt: '2024-03-01T00:00:00Z',
    lines: [
      {
        itemId: 'item-001',
        quantity: 20,
        receivedQty: 0,
      },
    ],
  }

  it('maps id and externalId from id field', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('trn-001')
    expect(result.externalId).toBe('trn-001')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TRF-2024-001')
  })

  it('maps fromLocationId from fromWarehouseId as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('wh-001')
  })

  it('maps toLocationId from toWarehouseId as string', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('wh-002')
  })

  it('maps status SHIPPED to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line productId from itemId', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.productId).toBe('item-001')
  })

  it('maps line quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines[0]?.quantity).toBe(20)
  })

  it('maps shippedAt from shippedAt field', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to netstock', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('netstock')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
