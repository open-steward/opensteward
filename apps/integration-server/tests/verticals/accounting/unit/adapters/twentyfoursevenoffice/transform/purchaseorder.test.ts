import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type TwentyFourSevenPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<TwentyFourSevenPurchaseOrder> = {}): TwentyFourSevenPurchaseOrder {
  return {
    id: '2457-po-1',
    orderNumber: 2001,
    supplierId: 'supp-8',
    currency: 'NOK',
    orderDate: '2024-01-15',
    status: 'active',
    totalAmount: 5000,
    taxAmount: 1250,
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (twentyfoursevenoffice)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('2457-po-1')
  })

  it('maps supplierId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('supp-8')
  })

  it('maps totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('NOK')
  })

  it('maps orderDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makePurchaseOrder({
      lines: [
        {
          id: 'line-po-1',
          productId: 'mat-2',
          description: 'Steel',
          quantity: 10,
          unitPrice: 50,
          amount: 500,
          taxCode: 'VAT25',
          taxAmount: 125,
          accountId: 'acc-4000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-po-1')
    expect(li.itemId).toBe('mat-2')
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(125)
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
