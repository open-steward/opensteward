import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type ManagerPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePO(overrides: Partial<ManagerPurchaseOrder> = {}): ManagerPurchaseOrder {
  return {
    key: 'po-key-1',
    date: '2024-11-01',
    reference: 'PO-2024-001',
    supplier: 'supplier-uuid',
    description: 'Office supplies order',
    totalAmount: { value: 800.0, currency: 'GBP' },
    status: 'Open',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps key to id', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('po-key-1')
  })

  it('maps supplier to contactId', () => {
    expect(transformPurchaseOrder(makePO()).contactId).toBe('supplier-uuid')
  })

  it('extracts currency from totalAmount.currency', () => {
    expect(transformPurchaseOrder(makePO()).currency).toBe('GBP')
  })

  it('converts totalAmount to minor units', () => {
    // 800.0 → 80000
    expect(transformPurchaseOrder(makePO()).totalAmount).toBe(80000)
  })

  it('maps status Open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps status Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('parses date as postedAt', () => {
    expect(transformPurchaseOrder(makePO()).postedAt).toEqual(new Date('2024-11-01'))
  })

  it('maps lines to lineItems', () => {
    const result = transformPurchaseOrder(
      makePO({
        lines: [
          {
            item: 'item-uuid',
            account: 'acct-3',
            lineDescription: 'Paper reams',
            qty: 10,
            unitPrice: 80.0,
            amount: { value: 800.0, currency: 'GBP' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('item-uuid')
    expect(li.accountId).toBe('acct-3')
    expect(li.itemDescription).toBe('Paper reams')
    expect(li.unitQuantity).toBe(10)
    expect(li.unitAmount).toBe(8000)
    expect(li.totalAmount).toBe(80000)
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePO()))).not.toThrow()
  })
})
