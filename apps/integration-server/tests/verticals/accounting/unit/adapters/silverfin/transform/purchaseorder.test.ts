import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SilverfinPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<SilverfinPurchaseOrder> = {}): SilverfinPurchaseOrder {
  return {
    id: '7001',
    status: 'draft',
    order_number: 'PO-2024-001',
    period: '2024-03-08',
    total_amount: 1800,
    currency: 'EUR',
    contact_id: '60',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('7001')
    expect(result.contactId).toBe('60')
    expect(result.totalAmount).toBe(1800)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as postedAt Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'approved' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
