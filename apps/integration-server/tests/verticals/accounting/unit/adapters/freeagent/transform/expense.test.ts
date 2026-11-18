import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type FreeAgentExpense,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/expense'

function makeExpense(overrides: Partial<FreeAgentExpense> = {}): FreeAgentExpense {
  return {
    url: 'https://api.freeagent.com/v2/expenses/55',
    user: 'https://api.freeagent.com/v2/users/3',
    category: 'https://api.freeagent.com/v2/expense_categories/12',
    description: 'Train ticket to London',
    dated_on: '2024-05-10',
    currency: 'GBP',
    gross_value: '45.00',
    sales_tax_value: '7.50',
    native_gross_value: '45.00',
    attachment_url: '',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('extracts id from url', () => {
    expect(transformExpense(makeExpense()).id).toBe('55')
  })

  it('extracts userId from user url', () => {
    expect(transformExpense(makeExpense()).userId).toBe('3')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Train ticket to London')
  })

  it('maps currency correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('GBP')
  })

  it('parses totalAmount from gross_value', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(4500)
  })

  it('parses taxAmount from sales_tax_value', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(750)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-10'))
  })

  it('returns undefined postedAt when dated_on is empty', () => {
    expect(transformExpense(makeExpense({ dated_on: '' })).postedAt).toBeUndefined()
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
