import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FattureCloudPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/purchaseorder'

function makePO(overrides: Partial<FattureCloudPurchaseOrder> = {}): FattureCloudPurchaseOrder {
  return { id: 90, entity: { id: 99 }, date: '2024-10-01', currency: { id: 'EUR' }, totals: { amount: 3000 }, status: { id: 'draft' }, ...overrides }
}

describe('transformPurchaseOrder (fatturecloud)', () => {
  it('maps id and contactId', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('90')
    expect(transformPurchaseOrder(makePO()).contactId).toBe('99')
  })
  it('draft → DRAFT', () => { expect(transformPurchaseOrder(makePO()).status).toBe('DRAFT') })
  it('received → COMPLETED', () => { expect(transformPurchaseOrder(makePO({ status: { id: 'received' } })).status).toBe('COMPLETED') })
  it('cancelled → CANCELLED', () => { expect(transformPurchaseOrder(makePO({ status: { id: 'cancelled' } })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
