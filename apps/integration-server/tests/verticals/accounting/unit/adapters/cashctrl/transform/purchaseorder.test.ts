import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/purchaseorder'
import type {
  CashCtrlOrder,
  CashCtrlOrderItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/invoice'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeOrder(overrides: Partial<CashCtrlOrder> = {}): CashCtrlOrder {
  return {
    id: 600,
    associateId: 8,
    currencyCode: 'CHF',
    total: 3000,
    isClosed: false,
    isBooked: false,
    date: '2025-05-01',
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlOrderItem> = {}): CashCtrlOrderItem {
  return {
    id: 1,
    articleId: 3,
    accountId: 5000,
    description: 'Raw material',
    unitPrice: 150,
    quantity: 20,
    amount: 3000,
    taxAmount: 231,
    discountPercent: 0,
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to string', () => {
    expect(transformPurchaseOrder(makeOrder({ id: 123 })).id).toBe('123')
  })

  it('maps associateId to contactId as string', () => {
    expect(transformPurchaseOrder(makeOrder({ associateId: 30 })).contactId).toBe('30')
  })

  it('maps null associateId to undefined contactId', () => {
    expect(transformPurchaseOrder(makeOrder({ associateId: null })).contactId).toBeUndefined()
  })

  it('maps currencyCode to currency', () => {
    expect(transformPurchaseOrder(makeOrder({ currencyCode: 'USD' })).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformPurchaseOrder(makeOrder({ total: 7500 })).totalAmount).toBe(7500)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeOrder({ date: '2025-07-01' })).postedAt).toEqual(
      new Date('2025-07-01'),
    )
  })

  it('maps isClosed=true to COMPLETED status', () => {
    expect(transformPurchaseOrder(makeOrder({ isClosed: true })).status).toBe('COMPLETED')
  })

  it('maps isBooked=true and not closed to ACTIVE status', () => {
    expect(transformPurchaseOrder(makeOrder({ isClosed: false, isBooked: true })).status).toBe(
      'ACTIVE',
    )
  })

  it('maps neither booked nor closed to DRAFT status', () => {
    expect(transformPurchaseOrder(makeOrder({ isClosed: false, isBooked: false })).status).toBe(
      'DRAFT',
    )
  })

  it('maps items to lineItems', () => {
    const result = transformPurchaseOrder(makeOrder({ items: [makeItem()] }))
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps lineitem accountId to string', () => {
    const result = transformPurchaseOrder(makeOrder({ items: [makeItem({ accountId: 5000 })] }))
    expect(result.lineItems![0]!.accountId).toBe('5000')
  })

  it('maps lineitem unitPrice to unitAmount', () => {
    const result = transformPurchaseOrder(makeOrder({ items: [makeItem({ unitPrice: 99 })] }))
    expect(result.lineItems![0]!.unitAmount).toBe(99)
  })

  it('produces empty lineItems array when items is null', () => {
    expect(transformPurchaseOrder(makeOrder({ items: null })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() =>
      PurchaseOrderSchema.parse(transformPurchaseOrder(makeOrder({ items: [makeItem()] }))),
    ).not.toThrow()
  })
})
