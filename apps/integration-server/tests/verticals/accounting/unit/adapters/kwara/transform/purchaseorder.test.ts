import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type KwaraPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/purchaseorder'

function makeRaw(overrides: Partial<KwaraPurchaseOrder> = {}): KwaraPurchaseOrder {
  return { id: 'po-001', ...overrides }
}

describe('transformPurchaseOrder (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformPurchaseOrder(makeRaw())
    expect(r.id).toBe('po-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
