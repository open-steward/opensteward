import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

const base = {
  id: 'po-20',
  po_number: 'PO-2024-020',
  po_date: '2024-08-10T00:00:00.000Z',
  contact: { id: 'supplier-7' },
  currency: 'USD',
  po_status: 'Open',
  total_amount: 30000,
  tax_amount: 3000,
  created_at: '2024-08-10T00:00:00.000Z',
  updated_at: '2024-08-11T00:00:00.000Z',
  items: [
    {
      id: 'li-10',
      description: 'Raw components',
      unit_price: 30000,
      quantity: 1,
      amount: 30000,
    },
  ],
}

describe('transformPurchaseOrder', () => {
  it('maps core fields', () => {
    const result = transformPurchaseOrder(base)
    expect(result.id).toBe('po-20')
    expect(result.contactId).toBe('supplier-7')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(30000)
  })

  it('maps po_status Open to ACTIVE', () => {
    expect(transformPurchaseOrder(base).status).toBe('ACTIVE')
  })

  it('maps po_status Closed to COMPLETED', () => {
    expect(transformPurchaseOrder({ ...base, po_status: 'Closed' }).status).toBe('COMPLETED')
  })

  it('maps po_status Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder({ ...base, po_status: 'Cancelled' }).status).toBe('CANCELLED')
  })

  it('maps po_status Draft to DRAFT', () => {
    expect(transformPurchaseOrder({ ...base, po_status: 'Draft' }).status).toBe('DRAFT')
  })

  it('falls back to status field when po_status absent', () => {
    const result = transformPurchaseOrder({ ...base, po_status: undefined, status: 'Closed' })
    expect(result.status).toBe('COMPLETED')
  })

  it('parses po_date as postedAt', () => {
    expect(transformPurchaseOrder(base).postedAt).toEqual(new Date('2024-08-10T00:00:00.000Z'))
  })

  it('maps contact from nested contact.id', () => {
    expect(transformPurchaseOrder(base).contactId).toBe('supplier-7')
  })

  it('maps items to lineItems', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Raw components')
    expect(result.lineItems![0].totalAmount).toBe(30000)
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(base))).not.toThrow()
  })
})
