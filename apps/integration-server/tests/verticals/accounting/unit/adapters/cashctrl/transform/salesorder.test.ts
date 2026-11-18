import { describe, it, expect } from 'vitest'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/salesorder'
import type {
  CashCtrlOrder,
  CashCtrlOrderItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/invoice'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeOrder(overrides: Partial<CashCtrlOrder> = {}): CashCtrlOrder {
  return {
    id: 700,
    associateId: 14,
    currencyCode: 'CHF',
    total: 5000,
    isClosed: false,
    isBooked: false,
    date: '2025-06-01',
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlOrderItem> = {}): CashCtrlOrderItem {
  return {
    id: 1,
    articleId: 7,
    accountId: 4000,
    description: 'Consulting',
    unitPrice: 500,
    quantity: 10,
    amount: 5000,
    taxAmount: 385,
    discountPercent: 0,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to string', () => {
    expect(transformSalesOrder(makeOrder({ id: 456 })).id).toBe('456')
  })

  it('maps associateId to contactId as string', () => {
    expect(transformSalesOrder(makeOrder({ associateId: 25 })).contactId).toBe('25')
  })

  it('maps null associateId to undefined contactId', () => {
    expect(transformSalesOrder(makeOrder({ associateId: null })).contactId).toBeUndefined()
  })

  it('maps currencyCode to currency', () => {
    expect(transformSalesOrder(makeOrder({ currencyCode: 'GBP' })).currency).toBe('GBP')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeOrder({ total: 12000 })).totalAmount).toBe(12000)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeOrder({ date: '2025-08-15' })).postedAt).toEqual(
      new Date('2025-08-15'),
    )
  })

  it('maps isClosed=true to COMPLETED status', () => {
    expect(transformSalesOrder(makeOrder({ isClosed: true })).status).toBe('COMPLETED')
  })

  it('maps isBooked=true and not closed to ACTIVE status', () => {
    expect(transformSalesOrder(makeOrder({ isClosed: false, isBooked: true })).status).toBe(
      'ACTIVE',
    )
  })

  it('maps neither booked nor closed to DRAFT status', () => {
    expect(transformSalesOrder(makeOrder({ isClosed: false, isBooked: false })).status).toBe(
      'DRAFT',
    )
  })

  it('maps items to lineItems', () => {
    const result = transformSalesOrder(makeOrder({ items: [makeItem()] }))
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps lineitem description', () => {
    const result = transformSalesOrder(
      makeOrder({ items: [makeItem({ description: 'Design work' })] }),
    )
    expect(result.lineItems![0]!.itemDescription).toBe('Design work')
  })

  it('maps lineitem quantity to unitQuantity', () => {
    const result = transformSalesOrder(makeOrder({ items: [makeItem({ quantity: 5 })] }))
    expect(result.lineItems![0]!.unitQuantity).toBe(5)
  })

  it('maps lineitem amount to totalAmount', () => {
    const result = transformSalesOrder(makeOrder({ items: [makeItem({ amount: 2500 })] }))
    expect(result.lineItems![0]!.totalAmount).toBe(2500)
  })

  it('produces empty lineItems array when items is null', () => {
    expect(transformSalesOrder(makeOrder({ items: null })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() =>
      SalesOrderSchema.parse(transformSalesOrder(makeOrder({ items: [makeItem()] }))),
    ).not.toThrow()
  })
})
