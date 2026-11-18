import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SagePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/purchaseorder'

describe('transformPurchaseOrder (SageBusinessCloud)', () => {
  it('maps id correctly', () => {
    const raw: SagePurchaseOrder = { id: 'po-001' }
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-001')
  })

  it('sets metadata to raw object', () => {
    const raw: SagePurchaseOrder = { id: 'po-002' }
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'po-001' }
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
