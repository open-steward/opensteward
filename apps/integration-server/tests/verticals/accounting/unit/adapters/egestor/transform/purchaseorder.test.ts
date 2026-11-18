import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type EgestorPurchaseOrderStub,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

describe('egestor transformPurchaseOrder (stub)', () => {
  it('returns metadata equal to raw input', () => {
    const raw: EgestorPurchaseOrderStub = { x: 1 }
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object with only metadata key', () => {
    const result = transformPurchaseOrder({})
    expect(Object.keys(result)).toEqual(['metadata'])
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    const result = transformPurchaseOrder({})
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
