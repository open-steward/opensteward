import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SmaccPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/purchaseorder'

function makeRaw(overrides: Partial<SmaccPurchaseOrder> = {}): SmaccPurchaseOrder {
  return {
    id: 'po-1',
    ...overrides,
  }
}

describe('smacc transformPurchaseOrder', () => {
  it('maps id to id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('po-1')
  })

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
