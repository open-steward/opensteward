import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type PowerOfficeExpense,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/expense'

function makeExpense(overrides: Partial<PowerOfficeExpense> = {}): PowerOfficeExpense {
  return {
    id: 77,
    employeeId: 3,
    description: 'Office supplies',
    transactionDate: '2024-05-15',
    currencyCode: 'NOK',
    grossAmount: 250,
    vatAmount: 50,
    status: 1,
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('77')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps employeeId to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('3')
  })

  it('maps currencyCode to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(250)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(50)
  })

  it('parses transactionDate as Date object for postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-15'))
  })

  it('sets userId to undefined when employeeId is falsy', () => {
    expect(transformExpense(makeExpense({ employeeId: 0 })).userId).toBeUndefined()
  })

  it('sets taxAmount to undefined when vatAmount is 0', () => {
    expect(transformExpense(makeExpense({ vatAmount: 0 })).taxAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when transactionDate is empty', () => {
    expect(transformExpense(makeExpense({ transactionDate: '' })).postedAt).toBeUndefined()
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
