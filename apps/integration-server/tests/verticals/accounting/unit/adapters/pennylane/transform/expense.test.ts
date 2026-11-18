import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type PennylaneExpense,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/expense'

function makeExpense(overrides: Partial<PennylaneExpense> = {}): PennylaneExpense {
  return {
    id: 'exp-1',
    label: 'Office supplies',
    date: '2024-05-10',
    currency: 'EUR',
    amount: 80,
    tax_amount: 8,
    supplier: { source_id: 'sup-2' },
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('maps label to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps supplier source_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('sup-2')
  })

  it('returns undefined contactId when supplier is null', () => {
    expect(transformExpense(makeExpense({ supplier: null })).contactId).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(80)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(8)
  })

  it('returns undefined taxAmount when tax_amount is zero', () => {
    expect(transformExpense(makeExpense({ tax_amount: 0 })).taxAmount).toBeUndefined()
  })

  it('parses date as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-10'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
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
