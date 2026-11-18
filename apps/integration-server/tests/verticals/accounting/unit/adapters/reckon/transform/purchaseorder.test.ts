import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ReckonPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/purchaseorder'

function makeRaw(overrides: Partial<ReckonPurchaseOrder> = {}): ReckonPurchaseOrder {
  return {
    id: 'po-001',
    orderNumber: 'PO-0001',
    date: '2024-04-10',
    dueDate: '2024-04-25',
    totalAmount: 4400,
    totalTax: 400,
    contactId: 'supplier-001',
    contactName: 'Parts Supplier',
    status: 'OPEN',
    lineItems: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('po-001')
    expect(result.contactId).toBe('supplier-001')
    expect(result.totalAmount).toBe(4400)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps OPEN to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps FULFILLED to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'FULFILLED' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED status', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Steel components',
          quantity: 20,
          unitAmount: 200,
          amount: 4000,
          taxAmount: 400,
          accountId: 'acc-700',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(4000)
    expect(result.lineItems![0].accountId).toBe('acc-700')
    expect(result.lineItems![0].unitQuantity).toBe(20)
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
