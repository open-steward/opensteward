import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type NetSuitePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/purchaseorder'

function makePO(overrides: Partial<NetSuitePurchaseOrder> = {}): NetSuitePurchaseOrder {
  return { id: 1100, entity: 50, total: 3000, currency: 'USD', status: 'Pending Receipt', ...overrides }
}

describe('transformPurchaseOrder (netsuite)', () => {
  it('maps id and contactId', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('1100')
    expect(transformPurchaseOrder(makePO()).contactId).toBe('50')
  })
  it('Fully Received → COMPLETED', () => { expect(transformPurchaseOrder(makePO({ status: 'Fully Received' })).status).toBe('COMPLETED') })
  it('Cancelled → CANCELLED', () => { expect(transformPurchaseOrder(makePO({ status: 'Cancelled' })).status).toBe('CANCELLED') })
  it('maps totalAmount', () => { expect(transformPurchaseOrder(makePO()).totalAmount).toBe(3000) })
  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
