import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type PayhawkExpense,
} from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<PayhawkExpense> = {}): PayhawkExpense {
  return {
    id: 'exp-1',
    title: 'Team Lunch',
    status: 'active',
    currency: 'GBP',
    amount: 50,
    totalAmount: 60,
    taxAmount: 10,
    paymentMethod: 'card',
    supplier: { id: 'supp-2', name: 'Vendor Co' },
    employee: { id: 'emp-5', name: 'Jane Doe' },
    reviewer: { id: 'rev-3', name: 'Manager' },
    documentDate: '2025-05-15',
    approvedAt: '2025-05-16T09:00:00.000Z',
    createdAt: '2025-05-15T12:00:00.000Z',
    updatedAt: '2025-05-16T10:00:00.000Z',
    lines: [{ id: 'ln-1', amount: 60, taxAmount: 10, accountId: 'acct-10', categoryName: 'Meals' }],
    ...overrides,
  }
}

describe('payhawk transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeRaw()).id).toBe('exp-1')
  })

  it('maps title to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Team Lunch')
  })

  it('maps supplier.id to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('supp-2')
  })

  it('maps employee.id to userId', () => {
    expect(transformExpense(makeRaw()).userId).toBe('emp-5')
  })

  it('maps reviewer.id to approverUserId', () => {
    expect(transformExpense(makeRaw()).approverUserId).toBe('rev-3')
  })

  it('maps currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('GBP')
  })

  it('maps totalAmount to minor units (prefers totalAmount over amount)', () => {
    expect(transformExpense(makeRaw({ totalAmount: 60 })).totalAmount).toBe(6000)
  })

  it('falls back to amount when totalAmount absent', () => {
    expect(transformExpense(makeRaw({ totalAmount: undefined, amount: 50 })).totalAmount).toBe(5000)
  })

  it('maps taxAmount to minor units', () => {
    expect(transformExpense(makeRaw()).taxAmount).toBe(1000)
  })

  it('maps line categoryName to itemDescription', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems?.[0]?.itemDescription).toBe('Meals')
  })

  it('maps documentDate to postedAt Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('passes ExpenseSchema.parse', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeRaw()))).not.toThrow()
  })
})
