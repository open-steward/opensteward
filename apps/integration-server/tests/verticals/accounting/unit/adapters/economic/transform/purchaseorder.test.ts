import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type EconomicPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/purchaseorder'

function makeRaw(overrides: Partial<EconomicPurchaseOrder> = {}): EconomicPurchaseOrder {
  return {
    orderNumber: 1,
    date: '2024-06-01',
    currency: 'DKK',
    netAmount: 800,
    grossAmount: 1000,
    supplier: { supplierNumber: 5, name: 'Supplier Co' },
    lines: [],
    isArchived: false,
    isSent: false,
    ...overrides,
  }
}

describe('economic transformPurchaseOrder', () => {
  it('maps orderNumber to id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })
  it('maps isArchived true -> COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ isArchived: true })).status).toBe('COMPLETED')
  })
  it('maps supplier.supplierNumber to contactId', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('5')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
