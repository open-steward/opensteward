import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type SapB1PurchaseOrder,
  type SapB1PurchaseOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/purchaseorder'

function makePurchaseOrderLine(overrides: Partial<SapB1PurchaseOrderLine> = {}): SapB1PurchaseOrderLine {
  return {
    ItemCode: 'ITEM-002',
    ItemDescription: 'Component',
    Quantity: 10,
    UnitPrice: 25,
    LineTotal: 250,
    VatAmount: 50,
    AccountCode: 'ACCT-002',
    ...overrides,
  }
}

function makePurchaseOrder(overrides: Partial<SapB1PurchaseOrder> = {}): SapB1PurchaseOrder {
  return {
    DocNum: 7001,
    CardCode: 'BP-002',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'USD',
    DocTotal: 3000,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps DocNum as string to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('7001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('BP-002')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3000)
  })

  it('parses DocDate as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Cancelled Y to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Cancelled: 'Y' })).status).toBe('CANCELLED')
  })

  it('maps DocStatus C to COMPLETED when not cancelled', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('COMPLETED')
  })

  it('maps open non-cancelled doc to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ DocStatus: 'O', Cancelled: 'N' })).status).toBe('ACTIVE')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ DocumentLines: [makePurchaseOrderLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-002')
    expect(result.lineItems![0].unitAmount).toBe(25)
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].totalAmount).toBe(250)
    expect(result.lineItems![0].taxAmount).toBe(50)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).lineItems).toHaveLength(0)
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
