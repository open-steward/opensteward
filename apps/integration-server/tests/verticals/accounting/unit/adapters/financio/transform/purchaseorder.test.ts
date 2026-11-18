import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FinancioPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/purchaseorder'

function makeRaw(overrides: Partial<FinancioPurchaseOrder> = {}): FinancioPurchaseOrder {
  return {
    id: '700',
    po_no: 'PO-001',
    po_date: '2024-07-01',
    due_date: '2024-07-31',
    sub_total: 2000,
    tax_total: 120,
    grand_total: 2120,
    status: 'draft',
    supplier_id: '20',
    supplier_name: 'Vendor Pte Ltd',
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('700')
    expect(result.contactId).toBe('20')
    expect(result.totalAmount).toBe(2120)
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ po_no: 'PO-SPECIAL' })
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['po_no']).toBe('PO-SPECIAL')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps approved status to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'approved' })).status).toBe('ACTIVE')
  })

  it('maps received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
