import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type IntacctExpense,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/expense'

function makeExpense(overrides: Partial<IntacctExpense> = {}): IntacctExpense {
  return {
    RECORDNO: 'exp-1',
    EMPLOYEEID: 'emp-1',
    DESCRIPTION: 'Office supplies',
    WHENCREATED: '2024-03-01',
    CURRENCY: 'USD',
    TOTALENTERED: '250.00',
    TOTALPAID: '250.00',
    STATE: 'Paid',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps RECORDNO to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('maps DESCRIPTION to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps EMPLOYEEID to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('emp-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('parses TOTALENTERED as totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(250)
  })

  it('parses WHENCREATED as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets postedAt to undefined when WHENCREATED is empty', () => {
    expect(transformExpense(makeExpense({ WHENCREATED: '' })).postedAt).toBeUndefined()
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
