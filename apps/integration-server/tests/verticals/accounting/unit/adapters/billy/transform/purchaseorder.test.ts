import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type BillyPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BillyPurchaseOrder> = {}): BillyPurchaseOrder {
  return {
    id: 'billy-po-1',
    orderNo: 2001,
    contactId: 'supplier-8',
    currencyId: 'DKK',
    entryDate: '2024-01-15',
    state: 'active',
    grossAmount: 8000,
    taxAmount: 1000,
    purchaseOrderLines: [],
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to id', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('billy-po-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supplier-8')
  })

  it('maps currencyId to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps grossAmount to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(8000)
  })

  it('parses entryDate as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active state to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft state to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps received state to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps completed state to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps voided state to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps cancelled state to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ state: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps purchaseOrderLines to lineItems', () => {
    const raw = makePurchaseOrder({
      purchaseOrderLines: [
        {
          id: 'pol-1',
          productId: 'prod-2',
          description: 'Component B',
          quantity: 10,
          unitPrice: 50,
          amount: 500,
          taxRateId: 'tax-2',
          taxAmount: 50,
          accountId: 'acc-20',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('pol-1')
    expect(li.itemId).toBe('prod-2')
    expect(li.itemDescription).toBe('Component B')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(50)
    expect(li.taxrateId).toBe('tax-2')
    expect(li.accountId).toBe('acc-20')
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
