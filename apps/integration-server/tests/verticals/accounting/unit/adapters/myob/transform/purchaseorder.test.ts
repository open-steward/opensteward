import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MyobPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/purchaseorder'

function makePO(overrides: Partial<MyobPurchaseOrder> = {}): MyobPurchaseOrder {
  return { UID: 'uid-12', Supplier: { UID: 'sup-1' }, TotalAmount: 4000, Status: 'Open', ...overrides }
}

describe('transformPurchaseOrder (myob)', () => {
  it('maps id and contactId', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('uid-12')
    expect(transformPurchaseOrder(makePO()).contactId).toBe('sup-1')
  })
  it('Closed → COMPLETED', () => { expect(transformPurchaseOrder(makePO({ Status: 'Closed' })).status).toBe('COMPLETED') })
  it('maps totalAmount', () => { expect(transformPurchaseOrder(makePO()).totalAmount).toBe(4000) })
  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
