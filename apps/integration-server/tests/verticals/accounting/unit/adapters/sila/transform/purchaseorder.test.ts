import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SilaStubPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/purchaseorder'

function makeRaw(overrides: Partial<SilaStubPurchaseOrder> = {}): SilaStubPurchaseOrder {
  return { ...overrides }
}

describe('sila transformPurchaseOrder', () => {
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
