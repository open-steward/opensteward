import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type KoraStubPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/purchaseorder'

function makeRaw(overrides: KoraStubPurchaseOrder = {}): KoraStubPurchaseOrder {
  return { ...overrides }
}

describe('kora transformPurchaseOrder', () => {
  it('handles empty object gracefully', () => {
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
