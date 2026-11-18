import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type InvoiceXpressExpense } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/expense'

function makeExpense(overrides: Partial<InvoiceXpressExpense> = {}): InvoiceXpressExpense {
  return {
    id: 40,
    date: '2024-05-20',
    description: 'Travel expenses',
    total: 150.75,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('40')
    expect(result.name).toBe('Travel expenses')
    expect(result.totalAmount).toBe(15075)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-05-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense({ description: 'Office rent' })
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when description is empty', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformExpense(makeExpense({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    const result = transformExpense(makeExpense({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
