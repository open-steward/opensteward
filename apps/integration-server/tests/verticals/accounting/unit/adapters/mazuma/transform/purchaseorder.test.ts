import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MazumaStubPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/purchaseorder'

function makeRaw(overrides: MazumaStubPurchaseOrder = {}): MazumaStubPurchaseOrder {
  return { ...overrides }
}

describe('mazuma transformPurchaseOrder', () => {
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
