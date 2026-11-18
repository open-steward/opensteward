import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type BukkuPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/purchaseorder'

function makeRaw(overrides: Partial<BukkuPurchaseOrder> = {}): BukkuPurchaseOrder {
  return {
    id: '60',
    number: 'PO-001',
    date: '2024-07-01',
    due_date: '2024-07-31',
    total: 1500,
    tax_total: 195,
    status: 'draft',
    contact_id: '99',
    contact_name: 'Supplier Co',
    line_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('60')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(1500)
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'PO-999' })
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('PO-999')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps confirmed status to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'confirmed' })).status).toBe('ACTIVE')
  })

  it('maps delivered status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'delivered' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
