import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type EBoekhoudenPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<EBoekhoudenPurchaseOrder> = {}): EBoekhoudenPurchaseOrder {
  return {
    id: 700,
    orderNumber: 'PO-001',
    relationId: 99,
    totalInclTax: 5000,
    status: 'active',
    date: '2024-07-01',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformPurchaseOrder (eboekhouden)', () => {
  it('maps id and contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('700')
    expect(result.contactId).toBe('99')
  })

  it('active → ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).status).toBe('ACTIVE')
  })

  it('received → COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('cancelled → CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
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
