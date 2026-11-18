import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type NiboExpense } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/expense'

function makeRaw(overrides: Partial<NiboExpense> = {}): NiboExpense {
  return {
    expenseId: 1,
    description: 'Papelaria',
    supplierId: 10,
    totalValue: 200,
    taxValue: 32,
    currencyCode: 'BRL',
    issueDate: '2024-03-10',
    items: [],
    ...overrides,
  }
}

describe('nibo transformExpense', () => {
  it('maps expenseId to id as string', () => {
    expect(transformExpense(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })
  it('maps description to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Papelaria')
  })
  it('maps issueDate to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-03-10'))
  })
  it('maps supplierId to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('10')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
