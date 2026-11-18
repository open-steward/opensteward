import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type PagaStubPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/purchaseorder'

function makeRaw(overrides: Partial<PagaStubPurchaseOrder> = {}): PagaStubPurchaseOrder {
  return { ...overrides }
}

describe('paga transformPurchaseOrder', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
