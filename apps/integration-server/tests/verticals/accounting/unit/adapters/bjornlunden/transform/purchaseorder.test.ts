import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type BlPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BlPurchaseOrder> = {}): BlPurchaseOrder {
  return {
    Id: 'bl-po-1',
    OrderNumber: 600,
    SupplierId: 'supp-3',
    Currency: 'SEK',
    OrderDate: '2024-01-15',
    TotalAmount: 10000,
    VatAmount: 2000,
    Status: 'Active',
    Lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps Id to id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('bl-po-1')
  })

  it('maps SupplierId to contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supp-3')
  })

  it('maps Currency to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('SEK')
  })

  it('maps TotalAmount to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(10000)
  })

  it('parses OrderDate as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps Active status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Received status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Lines to lineItems', () => {
    const raw = makePurchaseOrder({
      Lines: [
        {
          Id: 'pln-1',
          ArticleNumber: 'ART-002',
          Description: 'Raw material',
          Quantity: 20,
          UnitPrice: 100,
          Amount: 2000,
          AccountNumber: 4000,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('pln-1')
    expect(li.itemId).toBe('ART-002')
    expect(li.itemDescription).toBe('Raw material')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(20)
    expect(li.totalAmount).toBe(2000)
    expect(li.accountId).toBe('4000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
