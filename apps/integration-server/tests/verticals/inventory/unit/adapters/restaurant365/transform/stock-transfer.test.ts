import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawR365TransferTransaction,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('restaurant365 transformStockTransfer', () => {
  const raw: RawR365TransferTransaction = {
    transactionId: 'txn-guid-tr-001',
    transactionNumber: 'TR-1042',
    name: 'Item Transfer',
    type: 'Item Transfer',
    locationId: 'loc-guid-001',
    destinationLocationId: 'loc-guid-002',
    date: '2024-03-01T00:00:00Z',
    isApproved: true,
    createdBy: 'manager',
    lines: [
      {
        transactionDetailId: 'detail-guid-001',
        itemId: 'item-guid-001',
        quantity: 20,
        debit: 25.0,
        credit: undefined,
        comment: 'kitchen restock',
      },
    ],
  }

  it('maps transactionId to id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('txn-guid-tr-001')
    expect(result.externalId).toBe('txn-guid-tr-001')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('loc-guid-001')
    expect(result.toLocationId).toBe('loc-guid-002')
  })

  it('maps isApproved true to "completed"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('completed')
  })

  it('maps isApproved false to "draft"', () => {
    const result = transformStockTransfer({ ...raw, isApproved: false })
    expect(result.status).toBe('draft')
  })

  it('maps number from transactionNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-1042')
  })

  it('maps line items with quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-guid-001')
    expect(result.lines[0]!.quantity).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBeUndefined()
  })

  it('uses Math.abs(debit) as quantity fallback when quantity is absent', () => {
    const result = transformStockTransfer({
      ...raw,
      lines: [{ itemId: 'item-guid-001', quantity: undefined, debit: 10 }],
    })
    expect(result.lines[0]!.quantity).toBe(10)
  })

  it('maps shippedAt from date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets receivedAt when approved', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('omits receivedAt when not approved', () => {
    const result = transformStockTransfer({ ...raw, isApproved: false })
    expect(result.receivedAt).toBeUndefined()
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
