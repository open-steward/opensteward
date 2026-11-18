import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type EpsilonNetPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<EpsilonNetPurchaseOrder> = {}): EpsilonNetPurchaseOrder {
  return {
    id: '8001',
    orderNumber: 'PO-2024-001',
    status: 'Draft',
    issueDate: '2024-03-01',
    totalGrossValue: 930,
    totalVatAmount: 180,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL555666777' },
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('8001')
    expect(result.contactId).toBe('EL555666777')
    expect(result.totalAmount).toBe(930)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Submitted to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Submitted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Delivered to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Delivered' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
