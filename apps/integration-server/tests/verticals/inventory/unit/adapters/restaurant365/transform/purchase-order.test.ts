import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawR365PurchaseTransaction,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('restaurant365 transformPurchaseOrder', () => {
  const raw: RawR365PurchaseTransaction = {
    transactionId: 'txn-guid-001',
    transactionNumber: 'TXN-1042',
    name: 'AP Invoice #1042',
    type: 'AP Invoice',
    locationId: 'loc-guid-001',
    companyId: 'company-guid-001',
    date: '2024-03-01T00:00:00Z',
    isApproved: true,
    createdBy: 'manager',
    lines: [
      {
        transactionDetailId: 'detail-guid-001',
        itemId: 'item-guid-001',
        quantity: 10,
        debit: 25.0,
        credit: undefined,
        unitOfMeasureName: 'each',
        comment: 'weekly order',
      },
    ],
  }

  it('maps transactionId to id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('txn-guid-001')
    expect(result.externalId).toBe('txn-guid-001')
  })

  it('maps supplierId from companyId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('company-guid-001')
  })

  it('maps AP Invoice + approved to "closed"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('closed')
  })

  it('maps AP Invoice + unapproved to "partially_received"', () => {
    const result = transformPurchaseOrder({ ...raw, isApproved: false })
    expect(result.status).toBe('partially_received')
  })

  it('maps non-invoice + approved to "received"', () => {
    const result = transformPurchaseOrder({ ...raw, type: 'Purchase Order', isApproved: true })
    expect(result.status).toBe('received')
  })

  it('maps non-invoice + unapproved to "sent"', () => {
    const result = transformPurchaseOrder({ ...raw, type: 'Purchase Order', isApproved: false })
    expect(result.status).toBe('sent')
  })

  it('maps currency to USD', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps line items with productId and unit cost from debit', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-guid-001')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(25.0)
    expect(result.lines[0]!.lineTotal).toBe(250.0)
  })

  it('computes totalAmount from line totals', () => {
    const result = transformPurchaseOrder(raw)
    // 10 * 25.0 = 250
    expect(result.totalAmount).toBe(250)
    expect(result.subtotalAmount).toBe(250)
  })

  it('sets receivedAt = orderedAt when approved', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('omits receivedAt when not approved', () => {
    const result = transformPurchaseOrder({ ...raw, isApproved: false })
    expect(result.receivedAt).toBeUndefined()
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
