import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FreeeStubPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/purchaseorder'

describe('transformPurchaseOrder (freee stub)', () => {
  it('returns an object with metadata passthrough', () => {
    const raw: FreeeStubPurchaseOrder = { some_field: 'value' }
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object without crashing on empty input', () => {
    const raw: FreeeStubPurchaseOrder = {}
    const result = transformPurchaseOrder(raw)
    expect(result).toBeDefined()
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { some_field: 'value' }
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
