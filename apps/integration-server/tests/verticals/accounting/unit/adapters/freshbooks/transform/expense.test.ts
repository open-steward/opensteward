import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type FreshBooksExpense,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/expense'

function makeExpense(overrides: Partial<FreshBooksExpense> = {}): FreshBooksExpense {
  return {
    id: 99,
    vendor: 'vendor-123',
    account_name: 'Office Supplies',
    date: '2024-03-10',
    currency_code: 'USD',
    amount: { amount: '300.00', code: 'USD' },
    tax_amount1: { amount: '30.00', code: 'USD' },
    notes: 'Office chairs',
    status: 1,
    category: { name: 'Office' },
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformExpense(makeExpense()).id).toBe('99')
  })

  it('maps notes to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office chairs')
  })

  it('maps vendor to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-123')
  })

  it('maps currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(300)
  })

  it('parses tax_amount1 to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(30)
  })

  it('parses date as Date object for postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
