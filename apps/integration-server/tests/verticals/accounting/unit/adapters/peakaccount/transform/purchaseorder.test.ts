import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type PeakAccountPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<PeakAccountPurchaseOrder> = {}): PeakAccountPurchaseOrder {
  return {
    id: 'PO-001',
    documentNo: 'PO-2024-001',
    status: 'pending',
    issueDate: '2024-01-12',
    dueDate: '2024-02-12',
    totalAmount: 25000,
    currency: 'THB',
    contactId: 'SUPP-002',
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('PO-001')
    expect(result.contactId).toBe('SUPP-002')
    expect(result.totalAmount).toBe(25000)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-12'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps pending status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps approved status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'approved' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
