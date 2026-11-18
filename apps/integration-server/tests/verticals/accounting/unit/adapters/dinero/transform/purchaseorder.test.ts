import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type DineroPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<DineroPurchaseOrder> = {}): DineroPurchaseOrder {
  return {
    Guid: 'guid-po-1',
    Number: 200,
    ContactGuid: 'supplier-guid-1',
    Currency: 'DKK',
    Date: '2024-01-15',
    TotalInclVat: 7500,
    TotalVat: 1500,
    Status: 'Active',
    PurchaseOrderLines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps Guid to id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('guid-po-1')
  })

  it('maps ContactGuid to contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supplier-guid-1')
  })

  it('maps Currency to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps TotalInclVat to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(7500)
  })

  it('parses Date as Date object', () => {
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

  it('maps Received status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps PurchaseOrderLines to lineItems', () => {
    const raw = makePurchaseOrder({
      PurchaseOrderLines: [
        {
          Guid: 'poline-guid-1',
          ProductGuid: 'prod-guid-2',
          Description: 'Office Supply',
          Quantity: 10,
          AccountNumber: 2000,
          BaseAmountValue: 50,
          TotalAmount: 500,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('poline-guid-1')
    expect(li.itemId).toBe('prod-guid-2')
    expect(li.itemDescription).toBe('Office Supply')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.accountId).toBe('2000')
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
