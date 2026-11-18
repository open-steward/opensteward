import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AccountsIQPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AccountsIQPurchaseOrder> = {}): AccountsIQPurchaseOrder {
  return {
    purchaseOrderId: '9001',
    entityId: '10',
    status: 'Draft',
    purchaseOrderNumber: 'PO-2024-001',
    orderDate: '2024-03-08',
    totalAmount: 3200,
    currency: 'EUR',
    contactId: '66',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('9001')
    expect(result.contactId).toBe('66')
    expect(result.totalAmount).toBe(3200)
    expect(result.currency).toBe('EUR')
  })

  it('parses orderDate as postedAt Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Posted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
