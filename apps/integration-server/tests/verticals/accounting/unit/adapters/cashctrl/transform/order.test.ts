import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/order'
import type {
  CashCtrlOrder,
  CashCtrlOrderItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/invoice'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrder(overrides: Partial<CashCtrlOrder> = {}): CashCtrlOrder {
  return {
    id: 400,
    associateId: 12,
    currencyCode: 'CHF',
    total: 2500,
    isClosed: false,
    isBooked: false,
    date: '2025-04-01',
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlOrderItem> = {}): CashCtrlOrderItem {
  return {
    id: 1,
    articleId: 5,
    accountId: 3000,
    description: 'Service A',
    unitPrice: 250,
    quantity: 10,
    amount: 2500,
    taxAmount: 193,
    discountPercent: 0,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to string', () => {
    expect(transformOrder(makeOrder({ id: 88 })).id).toBe('88')
  })

  it('maps associateId to contactId as string', () => {
    expect(transformOrder(makeOrder({ associateId: 20 })).contactId).toBe('20')
  })

  it('maps null associateId to undefined contactId', () => {
    expect(transformOrder(makeOrder({ associateId: null })).contactId).toBeUndefined()
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrder(makeOrder({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeOrder({ total: 9999 })).totalAmount).toBe(9999)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeOrder({ date: '2025-05-15' })).postedAt).toEqual(
      new Date('2025-05-15'),
    )
  })

  it('maps isClosed=true to COMPLETED status', () => {
    expect(transformOrder(makeOrder({ isClosed: true })).status).toBe('COMPLETED')
  })

  it('maps isBooked=true and not closed to ACTIVE status', () => {
    expect(transformOrder(makeOrder({ isClosed: false, isBooked: true })).status).toBe('ACTIVE')
  })

  it('maps neither booked nor closed to DRAFT status', () => {
    expect(transformOrder(makeOrder({ isClosed: false, isBooked: false })).status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const result = transformOrder(makeOrder({ items: [makeItem()] }))
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps lineitem accountId to string', () => {
    const result = transformOrder(makeOrder({ items: [makeItem({ accountId: 3000 })] }))
    expect(result.lineItems![0]!.accountId).toBe('3000')
  })

  it('maps lineitem articleId to itemId as string', () => {
    const result = transformOrder(makeOrder({ items: [makeItem({ articleId: 15 })] }))
    expect(result.lineItems![0]!.itemId).toBe('15')
  })

  it('produces empty lineItems array when items is null', () => {
    expect(transformOrder(makeOrder({ items: null })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() =>
      OrderSchema.parse(transformOrder(makeOrder({ items: [makeItem()] }))),
    ).not.toThrow()
  })
})
