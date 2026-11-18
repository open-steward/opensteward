import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ErpNextPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/purchaseorder'

function makeRaw(overrides: Partial<ErpNextPurchaseOrder> = {}): ErpNextPurchaseOrder {
  return {
    name: 'PO-2024-00001',
    transaction_date: '2024-01-10',
    status: 'To Receive and Bill',
    currency: 'EUR',
    base_grand_total: 8000,
    supplier: 'Global Supplier',
    remarks: 'Q1 supplies',
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-2024-00001')
    expect(result.contactId).toBe('Global Supplier')
    expect(result.totalAmount).toBe(8000)
    expect(result.currency).toBe('EUR')
  })

  it('maps status Draft to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps status Completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
