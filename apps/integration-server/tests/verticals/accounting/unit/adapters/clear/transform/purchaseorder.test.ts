import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type ClearPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/purchaseorder'

function makeRaw(overrides: Partial<ClearPurchaseOrder> = {}): ClearPurchaseOrder {
  return {
    id: 'porder-uuid-001',
    ...overrides,
  }
}

describe('transformPurchaseOrder (clear)', () => {
  it('maps id correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('porder-uuid-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
