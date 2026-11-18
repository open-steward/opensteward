import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FakturoidPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FakturoidPurchaseOrder> = {}): FakturoidPurchaseOrder {
  return {
    id: 2001,
    number: 'PO-2024-001',
    subject_id: 77,
    status: 'open',
    issued_on: '2024-01-15',
    total: 5000,
    currency: 'CZK',
    vat_price: 1000,
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (fakturoid)', () => {
  it('maps id and core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('2001')
    expect(result.contactId).toBe('77')
    expect(result.currency).toBe('CZK')
    expect(result.totalAmount).toBe(5000)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "completed" to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status "received" to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "draft" to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps line items correctly', () => {
    const raw = makePurchaseOrder({
      lines: [
        {
          id: 20,
          name: 'Office Supplies',
          quantity: 2,
          unit_price: 500,
          vat_rate: 21,
          unit_price_without_vat: 500,
          unit_price_with_vat: 605,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('20')
    expect(li.itemDescription).toBe('Office Supplies')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1210)
  })

  it('sets metadata to the raw object by reference', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
