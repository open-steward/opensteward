import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FAPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/purchaseorder'

function makeRaw(overrides: Partial<FAPurchaseOrder> = {}): FAPurchaseOrder {
  return {
    id: 70,
    reference: 'PO-2024-001',
    ord_date: '2024-01-08',
    supplier_id: 4,
    curr_code: 'GBP',
    total: 3000,
    tax_total: 500,
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('70')
    expect(result.contactId).toBe('4')
    expect(result.totalAmount).toBe(3000)
    expect(result.currency).toBe('GBP')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-08'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
