import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type DolibarrPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/purchaseorder'

function makeRaw(overrides: Partial<DolibarrPurchaseOrder> = {}): DolibarrPurchaseOrder {
  return {
    id: 30,
    ref: 'CF2024-0001',
    ref_supplier: 'SUPP-PO-001',
    status: 1,
    date: 1705276800,
    total_ht: 3000,
    total_tva: 600,
    total_ttc: 3600,
    multicurrency_code: 'EUR',
    fk_soc: 12,
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('30')
    expect(result.contactId).toBe('12')
    expect(result.totalAmount).toBe(3600)
    expect(result.currency).toBe('EUR')
  })

  it('parses unix timestamp as Date', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
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
