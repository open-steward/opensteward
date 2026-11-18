import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/expense'
import type { GiddhVoucher } from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/invoice'

function makeRaw(overrides: Partial<GiddhVoucher> = {}): GiddhVoucher {
  return {
    uniqueName: 'expense-001',
    number: 'EXP-2024-001',
    voucherDate: '2024-03-05',
    dueDate: '',
    grandTotal: 5000,
    taxesTotal: 900,
    subTotal: 5000,
    balanceDue: 0,
    currency: 'INR',
    account: { uniqueName: 'emp-john', name: 'John Doe' },
    entries: [],
    status: 'paid',
    ...overrides,
  }
}

describe('transformExpense (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('expense-001')
    expect(result.name).toBe('EXP-2024-001')
    expect(result.contactId).toBe('emp-john')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(900)
  })

  it('parses voucherDate as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          description: 'Travel expense',
          quantity: 1,
          rate: 5000,
          amount: 5000,
          taxableAmount: 5000,
          accountUniqueName: 'travel-expense-account',
          accountName: 'Travel Expenses',
          taxes: [],
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('travel-expense-account')
    expect(result.lineItems![0].itemDescription).toBe('Travel expense')
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
