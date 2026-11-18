import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type EconomicExpense } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/expense'

function makeRaw(overrides: Partial<EconomicExpense> = {}): EconomicExpense {
  return {
    entryNumber: 1,
    account: { accountNumber: 1000, name: 'Cash' },
    supplier: { supplierNumber: 5, name: 'Supplier Co' },
    amount: -200,
    amountInBaseCurrency: -200,
    currency: 'DKK',
    text: 'Office supplies',
    date: '2024-02-15',
    vatAmount: 50,
    ...overrides,
  }
}

describe('economic transformExpense', () => {
  it('maps entryNumber to id', () => {
    expect(transformExpense(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })
  it('maps text to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Office supplies')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-02-15'))
  })
  it('uses Math.abs for totalAmount', () => {
    expect(transformExpense(makeRaw({ amount: -200 })).totalAmount).toBe(200)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
