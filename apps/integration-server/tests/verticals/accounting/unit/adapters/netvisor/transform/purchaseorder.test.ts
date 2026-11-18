import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type NetvisorPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<NetvisorPurchaseOrder> = {}): NetvisorPurchaseOrder {
  return {
    NetvisorKey: 200,
    OrderNumber: 2001,
    VendorIdentifier: 'VEND-01',
    Currency: 'EUR',
    OrderDate: '2024-01-15',
    Amount: 5000,
    VatAmount: 1200,
    Status: 'Open',
    OrderLines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (netvisor)', () => {
  it('maps NetvisorKey to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('200')
  })

  it('maps VendorIdentifier to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('VEND-01')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
  })

  it('maps Currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps OrderDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status Received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Received' })).status).toBe('COMPLETED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status Open to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Open' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Confirmed' })).status).toBe('ACTIVE')
  })

  it('maps OrderLines to lineItems', () => {
    const raw = makePurchaseOrder({
      OrderLines: [
        {
          NetvisorKey: 601,
          ProductIdentifier: 'MAT-1',
          ProductName: 'Steel',
          Quantity: 10,
          UnitPrice: 50,
          LineSum: 500,
          AccountNumber: '4000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('601')
    expect(li.itemId).toBe('MAT-1')
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
