import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ExactPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/purchaseorder'

function makePO(overrides: Partial<ExactPurchaseOrder> = {}): ExactPurchaseOrder {
  return { PurchaseOrderID: 'po-1', Supplier: 'sup-1', AmountDC: 3000, Currency: 'EUR', Status: 20, OrderDate: '2024-10-01', ...overrides }
}

describe('transformPurchaseOrder (exactonline)', () => {
  it('maps id and contactId', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('po-1')
    expect(transformPurchaseOrder(makePO()).contactId).toBe('sup-1')
  })
  it('Status 10 → DRAFT', () => {
    expect(transformPurchaseOrder(makePO({ Status: 10 })).status).toBe('DRAFT')
  })
  it('Status 50 → COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ Status: 50 })).status).toBe('COMPLETED')
  })
  it('Status 60 → CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ Status: 60 })).status).toBe('CANCELLED')
  })
  it('maps totalAmount', () => {
    expect(transformPurchaseOrder(makePO()).totalAmount).toBe(3000)
  })
  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
