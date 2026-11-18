import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type UhasibuPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/purchaseorder'

function makeRaw(overrides: Partial<UhasibuPurchaseOrder> = {}): UhasibuPurchaseOrder {
  return {
    id: 'upo-1',
    ...overrides,
  }
}

describe('uhasibu transformPurchaseOrder', () => {
  it('maps id to id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('upo-1')
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
