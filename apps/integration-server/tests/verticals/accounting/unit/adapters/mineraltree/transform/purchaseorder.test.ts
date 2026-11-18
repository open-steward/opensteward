import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type MtPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePO(overrides: Partial<MtPurchaseOrder> = {}): MtPurchaseOrder {
  return {
    id: 'mt_po_001',
    externalId: 'EXT-PO-1',
    poNumber: 'PO-9000',
    vendor: { id: 'vnd_10', name: 'Parts Co' },
    state: 'Released',
    amount: { amount: 750.0, currency: 'USD' },
    transactionDate: '2024-03-01',
    dueDate: '2024-04-01',
    ...overrides,
  }
}

describe('transformPurchaseOrder (mineraltree)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('mt_po_001')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformPurchaseOrder(makePO()).contactId).toBe('vnd_10')
  })

  it('maps currency from amount.currency', () => {
    expect(transformPurchaseOrder(makePO()).currency).toBe('USD')
  })

  it('converts decimal amount to integer minor units via toMinorUnits', () => {
    // 750.00 * 100 = 75000
    expect(transformPurchaseOrder(makePO()).totalAmount).toBe(75000)
  })

  it('maps transactionDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePO()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('falls back to dueDate for postedAt when transactionDate is absent', () => {
    const result = transformPurchaseOrder(makePO({ transactionDate: undefined }))
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps state Released to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ state: 'Released' })).status).toBe('ACTIVE')
  })

  it('maps state New to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ state: 'New' })).status).toBe('ACTIVE')
  })

  it('maps state PartiallyReceived to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ state: 'PartiallyReceived' })).status).toBe('ACTIVE')
  })

  it('maps state Received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ state: 'Received' })).status).toBe('COMPLETED')
  })

  it('maps state FullyBilled to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ state: 'FullyBilled' })).status).toBe('COMPLETED')
  })

  it('maps state Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ state: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps state Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ state: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('merges expenses and items into lineItems', () => {
    const raw = makePO({
      expenses: [
        {
          id: 'exp_1',
          description: 'Freight',
          amount: { amount: 50.0, currency: 'USD' },
          unitCost: { amount: 50.0, currency: 'USD' },
          quantity: 1,
        },
      ],
      items: [
        {
          id: 'item_1',
          description: 'Part A',
          amount: { amount: 200.0, currency: 'USD' },
          unitCost: { amount: 100.0, currency: 'USD' },
          quantity: 2,
          item: { id: 'it_55', name: 'Part A' },
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('exp_1')
    expect(result.lineItems![0].totalAmount).toBe(5000) // 50 * 100
    expect(result.lineItems![0].unitAmount).toBe(5000)
    expect(result.lineItems![1].id).toBe('item_1')
    expect(result.lineItems![1].itemId).toBe('it_55')
    expect(result.lineItems![1].itemName).toBe('Part A')
    expect(result.lineItems![1].totalAmount).toBe(20000) // 200 * 100
    expect(result.lineItems![1].unitAmount).toBe(10000) // 100 * 100
    expect(result.lineItems![1].unitQuantity).toBe(2)
  })

  it('passes raw object as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePO()))).not.toThrow()
  })
})
