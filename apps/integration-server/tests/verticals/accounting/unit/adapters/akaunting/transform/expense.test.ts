import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type AkauntingExpense,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/expense'

function makeExpense(overrides: Partial<AkauntingExpense> = {}): AkauntingExpense {
  return {
    id: 701,
    contact_id: 42,
    currency_code: 'EUR',
    issued_at: '2024-02-15',
    amount: 1500,
    tax_total: 300,
    description: 'Office supplies',
    category_name: 'General Expenses',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('701')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('falls back to category_name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBe('General Expenses')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1500)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(300)
  })

  it('maps issued_at to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when issued_at is empty', () => {
    expect(transformExpense(makeExpense({ issued_at: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when both description and category_name are empty', () => {
    expect(
      transformExpense(makeExpense({ description: '', category_name: '' })).name,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
