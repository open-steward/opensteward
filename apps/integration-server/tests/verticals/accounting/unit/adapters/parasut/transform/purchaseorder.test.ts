import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ParasutPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ParasutPurchaseOrder> = {}): ParasutPurchaseOrder {
  return {
    id: 'po_1',
    type: 'purchase_invoices',
    attributes: {
      status: 'sent',
      invoice_no: 'PO-001',
      gross_total: 4500,
      issue_date: '2024-07-01',
      currency: 'TRY',
      contact_id: 'supplier_12',
    },
    ...overrides,
  }
}

describe('transformPurchaseOrder (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po_1')
  })

  it('maps totalAmount and currency', () => {
    const po = transformPurchaseOrder(makePurchaseOrder())
    expect(po.totalAmount).toBe(4500)
    expect(po.currency).toBe('TRY')
  })

  it('maps contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('supplier_12')
  })

  it('maps sent status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const raw = makePurchaseOrder({ attributes: { ...makePurchaseOrder().attributes, status: 'draft' } })
    expect(transformPurchaseOrder(raw).status).toBe('DRAFT')
  })

  it('maps cancelled status to CANCELLED', () => {
    const raw = makePurchaseOrder({ attributes: { ...makePurchaseOrder().attributes, status: 'cancelled' } })
    expect(transformPurchaseOrder(raw).status).toBe('CANCELLED')
  })

  it('maps completed status to COMPLETED', () => {
    const raw = makePurchaseOrder({ attributes: { ...makePurchaseOrder().attributes, status: 'completed' } })
    expect(transformPurchaseOrder(raw).status).toBe('COMPLETED')
  })

  it('parses date as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
