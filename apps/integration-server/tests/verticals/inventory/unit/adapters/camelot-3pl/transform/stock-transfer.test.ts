import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawCamelot3plStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('camelot-3pl transformStockTransfer', () => {
  const raw: RawCamelot3plStockTransfer = {
    transferId: 'xfr-001',
    transferNumber: 'TR-2024-001',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    status: 'IN TRANSIT',
    lines: [
      {
        itemId: 'item-001',
        quantity: 20,
        quantityReceived: 20,
      },
    ],
    shipDate: '2024-03-01T00:00:00Z',
    completedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from transferId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('xfr-001')
    expect(result.externalId).toBe('xfr-001')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-2024-001')
  })

  it('maps fromLocationId from fromWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('wh-001')
  })

  it('maps toLocationId from toWarehouseId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('wh-002')
  })

  it('maps IN TRANSIT status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps COMPLETED status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps CANCELLED status to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(20)
  })

  it('maps shippedAt from shipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from completedDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
