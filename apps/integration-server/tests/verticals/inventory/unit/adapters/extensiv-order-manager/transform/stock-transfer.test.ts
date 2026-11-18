import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawExtensivStockTransfer,
  type RawExtensivStockTransferItem,
} from '../../../../../../../src/verticals/inventory/adapters/extensiv-order-manager/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('extensiv-order-manager transformStockTransfer', () => {
  const items: RawExtensivStockTransferItem[] = [
    {
      stockTransferOrderItemId: 6001,
      productId: 101,
      masterSku: 'WK-2026',
      quantity: 25,
      status: 'SHIPPED',
      receivedDate: '2024-04-01T00:00:00Z',
    },
  ]

  const raw: RawExtensivStockTransfer = {
    stockTransferOrderId: 7001,
    stockTransferOrderNumber: 'ST-0001',
    fromWarehouseId: 301,
    toWarehouseId: 302,
    status: 'IN_TRANSIT',
    createdDate: '2024-03-01T00:00:00Z',
    internalNotes: 'Handle with care',
    items,
  }

  it('maps id from stockTransferOrderId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('7001')
    expect(result.externalId).toBe('7001')
  })

  it('maps number from stockTransferOrderNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('ST-0001')
  })

  it('maps fromLocationId from fromWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('301')
  })

  it('maps toLocationId from toWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('302')
  })

  it('maps status IN_TRANSIT to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status COMPLETED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps status DRAFT to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps lines from items array', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantity).toBe(25)
  })

  it('maps shippedAt from createdDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('derives receivedAt from latest item receivedDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('leaves receivedAt undefined when no items have receivedDate', () => {
    const result = transformStockTransfer({
      ...raw,
      items: [{ ...items[0]!, receivedDate: null }],
    })
    expect(result.receivedAt).toBeUndefined()
  })

  it('handles null items gracefully', () => {
    const result = transformStockTransfer({ ...raw, items: null })
    expect(result.lines).toHaveLength(0)
    expect(result.receivedAt).toBeUndefined()
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
