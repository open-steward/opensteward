import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MoneybirdPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/purchaseorder'

function makePO(overrides: Partial<MoneybirdPurchaseOrder> = {}): MoneybirdPurchaseOrder {
  return { id: 1200, contact_id: 99, total_price_incl_tax: '3000', currency: 'EUR', state: 'open', ...overrides }
}

describe('transformPurchaseOrder (moneybird)', () => {
  it('maps id and contactId', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('1200')
    expect(transformPurchaseOrder(makePO()).contactId).toBe('99')
  })
  it('draft → DRAFT', () => { expect(transformPurchaseOrder(makePO({ state: 'draft' })).status).toBe('DRAFT') })
  it('received → COMPLETED', () => { expect(transformPurchaseOrder(makePO({ state: 'received' })).status).toBe('COMPLETED') })
  it('cancelled → CANCELLED', () => { expect(transformPurchaseOrder(makePO({ state: 'cancelled' })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
