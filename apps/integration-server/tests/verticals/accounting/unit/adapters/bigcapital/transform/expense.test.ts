import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  untransformExpense,
  type BigcapitalExpense,
  type BigcapitalExpenseCategory,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

const sampleCategories: BigcapitalExpenseCategory[] = [
  { id: 1, amount: 150, expenseAccountId: 6000, description: 'Flight tickets' },
]

function makeRaw(overrides: Partial<BigcapitalExpense> = {}): BigcapitalExpense {
  return {
    id: 33,
    referenceNo: 'EXP-REF-033',
    payeeId: 7,
    paymentAccountId: 1100,
    userId: 2,
    currencyCode: 'USD',
    description: 'Business travel',
    totalAmount: 150,
    isPublished: true,
    paymentDate: '2024-01-20',
    categories: sampleCategories,
    createdAt: '2024-01-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('33')
    expect(result.contactId).toBe('7')
    expect(result.accountId).toBe('1100')
    expect(result.userId).toBe('2')
    expect(result.currency).toBe('USD')
    // totalAmount=150 → toMinor → 15000
    expect(result.totalAmount).toBe(15000)
  })

  it('parses paymentDate as postedAt Date', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
  })

  it('maps categories to lineItems', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('6000')
    expect(li.itemDescription).toBe('Flight tickets')
    // amount=150 → toMinor → 15000
    expect(li.totalAmount).toBe(15000)
  })

  it('parses createdAt as Date', () => {
    const result = transformExpense(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-18T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformExpense (accountId, contactId, currency)', () => {
    const canonical = transformExpense(makeRaw())
    const back = untransformExpense(canonical)
    expect(back['paymentAccountId']).toBe(1100)
    expect(back['payeeId']).toBe(7)
    expect(back['currencyCode']).toBe('USD')
  })
})
