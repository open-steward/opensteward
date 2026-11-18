import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type CashCtrlOrder,
  type CashCtrlOrderItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeOrder(overrides: Partial<CashCtrlOrder> = {}): CashCtrlOrder {
  return {
    id: 300,
    nr: 'INV-2025-001',
    associateId: 7,
    currencyCode: 'CHF',
    total: 1077,
    totalTax: 77,
    openAmount: 0,
    isBooked: true,
    isClosed: true,
    date: '2025-02-01',
    dueDate: '2025-03-03',
    description: 'PO-REF-001',
    notes: 'Thank you for your business.',
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlOrderItem> = {}): CashCtrlOrderItem {
  return {
    id: 1,
    articleId: 10,
    accountId: 4000,
    description: 'Widget',
    unitPrice: 100,
    quantity: 10,
    amount: 1000,
    taxAmount: 77,
    discountPercent: 0,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeOrder({ id: 55 })).id).toBe('55')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeOrder()).type).toBe('INVOICE')
  })

  it('maps nr to invoiceNumber', () => {
    expect(transformInvoice(makeOrder()).invoiceNumber).toBe('INV-2025-001')
  })

  it('maps associateId to contactId as string', () => {
    expect(transformInvoice(makeOrder({ associateId: 42 })).contactId).toBe('42')
  })

  it('maps null associateId to undefined contactId', () => {
    expect(transformInvoice(makeOrder({ associateId: null })).contactId).toBeUndefined()
  })

  it('maps currencyCode to currency', () => {
    expect(transformInvoice(makeOrder()).currency).toBe('CHF')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeOrder({ total: 2000 })).totalAmount).toBe(2000)
  })

  it('maps totalTax to taxAmount', () => {
    expect(transformInvoice(makeOrder({ totalTax: 150 })).taxAmount).toBe(150)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformInvoice(makeOrder({ openAmount: 500 })).balanceAmount).toBe(500)
  })

  it('computes paidAmount as total minus openAmount', () => {
    expect(transformInvoice(makeOrder({ total: 1000, openAmount: 400 })).paidAmount).toBe(600)
  })

  it('maps description to reference', () => {
    expect(transformInvoice(makeOrder({ description: 'PO-123' })).reference).toBe('PO-123')
  })

  it('maps notes', () => {
    expect(transformInvoice(makeOrder({ notes: 'Net 30' })).notes).toBe('Net 30')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformInvoice(makeOrder({ date: '2025-03-15' })).postedAt).toEqual(
      new Date('2025-03-15'),
    )
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformInvoice(makeOrder({ dueDate: '2025-04-15' })).dueAt).toEqual(
      new Date('2025-04-15'),
    )
  })

  it('maps status to PAID when isClosed and openAmount === 0', () => {
    expect(transformInvoice(makeOrder({ isClosed: true, openAmount: 0 })).status).toBe('PAID')
  })

  it('maps status to PARTIALLY_PAID when isClosed and openAmount > 0', () => {
    expect(transformInvoice(makeOrder({ isClosed: true, openAmount: 200 })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status to AUTHORIZED when isBooked and not closed', () => {
    expect(transformInvoice(makeOrder({ isClosed: false, isBooked: true })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps status to DRAFT when neither booked nor closed', () => {
    expect(transformInvoice(makeOrder({ isClosed: false, isBooked: false })).status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const result = transformInvoice(makeOrder({ items: [makeItem()] }))
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps lineitem id to string', () => {
    const result = transformInvoice(makeOrder({ items: [makeItem({ id: 7 })] }))
    expect(result.lineItems![0]!.id).toBe('7')
  })

  it('maps lineitem accountId to string', () => {
    const result = transformInvoice(makeOrder({ items: [makeItem({ accountId: 4000 })] }))
    expect(result.lineItems![0]!.accountId).toBe('4000')
  })

  it('maps lineitem articleId to itemId as string', () => {
    const result = transformInvoice(makeOrder({ items: [makeItem({ articleId: 20 })] }))
    expect(result.lineItems![0]!.itemId).toBe('20')
  })

  it('maps lineitem unitPrice to unitAmount', () => {
    const result = transformInvoice(makeOrder({ items: [makeItem({ unitPrice: 99.5 })] }))
    expect(result.lineItems![0]!.unitAmount).toBe(99.5)
  })

  it('produces empty lineItems array when items is null', () => {
    expect(transformInvoice(makeOrder({ items: null })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() =>
      InvoiceSchema.parse(transformInvoice(makeOrder({ items: [makeItem()] }))),
    ).not.toThrow()
  })
})
