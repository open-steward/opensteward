import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/bill'
import type { CashCtrlOrder } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeOrder(overrides: Partial<CashCtrlOrder> = {}): CashCtrlOrder {
  return {
    id: 200,
    nr: 'BILL-2025-001',
    associateId: 5,
    currencyCode: 'CHF',
    total: 1000,
    totalTax: 77,
    openAmount: 0,
    isBooked: true,
    isClosed: true,
    date: '2025-01-15',
    dueDate: '2025-02-15',
    notes: 'Supplier invoice',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id to string', () => {
    expect(transformBill(makeOrder({ id: 99 })).id).toBe('99')
  })

  it('maps nr to billNumber', () => {
    expect(transformBill(makeOrder()).billNumber).toBe('BILL-2025-001')
  })

  it('maps associateId to contactId as string', () => {
    expect(transformBill(makeOrder({ associateId: 42 })).contactId).toBe('42')
  })

  it('maps null associateId to undefined contactId', () => {
    expect(transformBill(makeOrder({ associateId: null })).contactId).toBeUndefined()
  })

  it('maps currencyCode to currency', () => {
    expect(transformBill(makeOrder()).currency).toBe('CHF')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeOrder({ total: 500 })).totalAmount).toBe(500)
  })

  it('maps totalTax to taxAmount', () => {
    expect(transformBill(makeOrder({ totalTax: 38.5 })).taxAmount).toBe(38.5)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformBill(makeOrder({ openAmount: 250 })).balanceAmount).toBe(250)
  })

  it('computes paidAmount as total minus openAmount', () => {
    expect(transformBill(makeOrder({ total: 1000, openAmount: 300 })).paidAmount).toBe(700)
  })

  it('maps paidAmount to undefined when total is null', () => {
    expect(transformBill(makeOrder({ total: null, openAmount: 0 })).paidAmount).toBeUndefined()
  })

  it('maps notes', () => {
    expect(transformBill(makeOrder({ notes: 'Net 30' })).notes).toBe('Net 30')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeOrder({ date: '2025-03-01' })).postedAt).toEqual(
      new Date('2025-03-01'),
    )
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeOrder({ dueDate: '2025-04-01' })).dueAt).toEqual(
      new Date('2025-04-01'),
    )
  })

  it('maps status to PAID when isClosed and openAmount === 0', () => {
    expect(transformBill(makeOrder({ isClosed: true, openAmount: 0 })).status).toBe('PAID')
  })

  it('maps status to PARTIALLY_PAID when isClosed and openAmount > 0', () => {
    expect(transformBill(makeOrder({ isClosed: true, openAmount: 100 })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status to AUTHORIZED when isBooked and not closed', () => {
    expect(
      transformBill(makeOrder({ isClosed: false, isBooked: true, openAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status to DRAFT when neither booked nor closed', () => {
    expect(
      transformBill(makeOrder({ isClosed: false, isBooked: false, openAmount: 0 })).status,
    ).toBe('DRAFT')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeOrder()))).not.toThrow()
  })
})
