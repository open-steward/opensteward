import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ProcountorPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ProcountorPurchaseOrder> = {}): ProcountorPurchaseOrder {
  return {
    id: 222,
    orderNumber: 2001,
    partnerId: 60,
    currency: 'EUR',
    date: '2024-01-15',
    sum: 5000,
    vatAmount: 1200,
    status: 'CONFIRMED',
    orderRows: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (procountor)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('222')
  })

  it('maps partnerId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('60')
  })

  it('maps sum to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status RECEIVED to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'RECEIVED' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'COMPLETED' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps status EMPTY to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps status UNFINISHED to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps orderRows to lineItems', () => {
    const raw = makePurchaseOrder({
      orderRows: [
        {
          id: 1001,
          product: 'MAT-01',
          description: 'Steel',
          quantity: 10,
          unitPrice: 50,
          sum: 500,
          accountNumber: '4000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1001')
    expect(li.itemId).toBe('MAT-01')
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.accountId).toBe('4000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
