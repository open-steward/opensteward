import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawIncreffStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('increff transformStockTransfer', () => {
  const raw: RawIncreffStockTransfer = {
    transferCode: 'TR-2024-001',
    fromWarehouseCode: 'WH-MUM-01',
    toWarehouseCode: 'WH-DEL-01',
    status: 'IN_TRANSIT',
    items: [{ skuCode: 'SKU-001', quantity: 50, receivedQty: 50 }],
    shippedOn: '2024-03-01T00:00:00Z',
    completedOn: '2024-03-05T00:00:00Z',
  }

  it('maps id, externalId, and number from transferCode', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TR-2024-001')
    expect(result.externalId).toBe('TR-2024-001')
    expect(result.number).toBe('TR-2024-001')
  })

  it('maps fromLocationId and toLocationId from warehouse codes', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH-MUM-01')
    expect(result.toLocationId).toBe('WH-DEL-01')
  })

  it('maps IN_TRANSIT status to in_transit', () => {
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
    expect(result.lines[0]!.productId).toBe('SKU-001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt from shippedOn', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from completedOn', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to increff', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('increff')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
