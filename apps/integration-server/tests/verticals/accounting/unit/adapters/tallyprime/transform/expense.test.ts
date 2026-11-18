import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type TallyExpense,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/expense'

function makeExpense(overrides: Partial<TallyExpense> = {}): TallyExpense {
  return {
    VOUCHERNUMBER: 'EXP/2024/001',
    PARTYLEDGERNAME: 'Travel Agency Ltd',
    DATE: '20240505',
    AMOUNT: '3200.00',
    NARRATION: 'Business travel expenses',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps VOUCHERNUMBER to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('EXP/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('Travel Agency Ltd')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(3200)
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-05'))
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformExpense(makeExpense({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    expect(transformExpense(makeExpense({ AMOUNT: 'N/A' })).totalAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformExpense(makeExpense({ DATE: 'not-a-date' })).postedAt).toBeUndefined()
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
