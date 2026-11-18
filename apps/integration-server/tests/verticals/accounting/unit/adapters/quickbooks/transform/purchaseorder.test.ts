import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type QBOPurchaseOrder,
  type QBOPurchaseOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/purchaseorder'

function makeItemLine(overrides: Partial<QBOPurchaseOrderLine> = {}): QBOPurchaseOrderLine {
  return {
    Id: 'line-1',
    Description: 'Office chair',
    Amount: 300,
    DetailType: 'ItemBasedExpenseLineDetail',
    ItemBasedExpenseLineDetail: { ItemRef: { value: 'item-5' }, UnitPrice: 300, Qty: 1 },
    ...overrides,
  }
}

function makeAccountLine(overrides: Partial<QBOPurchaseOrderLine> = {}): QBOPurchaseOrderLine {
  return {
    Id: 'line-2',
    Description: 'Office rent',
    Amount: 2000,
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: { AccountRef: { value: 'acct-10' }, UnitPrice: 2000, Qty: 1 },
    ...overrides,
  }
}

function makePurchaseOrder(overrides: Partial<QBOPurchaseOrder> = {}): QBOPurchaseOrder {
  return {
    Id: 'po-1',
    DocNumber: 'PO-2024-001',
    VendorRef: { value: 'vendor-1' },
    TxnDate: '2024-01-15',
    TotalAmt: 5000,
    POStatus: 'Open',
    CurrencyRef: { value: 'USD' },
    Line: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps Id to id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps VendorRef.value to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-1')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
  })

  it('parses TxnDate as Date object for postedAt', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps POStatus Open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ POStatus: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps POStatus Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ POStatus: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps unknown POStatus to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ POStatus: 'Unknown' })).status).toBe('DRAFT')
  })

  it('maps ItemBasedExpenseLineDetail lines to lineItems', () => {
    const line = makeItemLine()
    const result = transformPurchaseOrder(makePurchaseOrder({ Line: [line] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      id: 'line-1',
      itemId: 'item-5',
      itemDescription: 'Office chair',
      unitAmount: 300,
      unitQuantity: 1,
      totalAmount: 300,
    })
  })

  it('maps AccountBasedExpenseLineDetail lines to lineItems', () => {
    const line = makeAccountLine()
    const result = transformPurchaseOrder(makePurchaseOrder({ Line: [line] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      id: 'line-2',
      accountId: 'acct-10',
      itemDescription: 'Office rent',
      totalAmount: 2000,
    })
  })

  it('filters out unrecognized line detail types', () => {
    const line = makeItemLine({ DetailType: 'SubTotalLineDetail', ItemBasedExpenseLineDetail: undefined })
    const result = transformPurchaseOrder(makePurchaseOrder({ Line: [line] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
