import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type BillyExpense,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/expense'

function makeExpense(overrides: Partial<BillyExpense> = {}): BillyExpense {
  return {
    id: 'exp-001',
    contactId: 'contact-3',
    currencyId: 'DKK',
    entryDate: '2024-02-15',
    grossAmount: 1500,
    taxAmount: 300,
    description: 'Office supplies',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('contact-3')
  })

  it('maps currencyId to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('DKK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1500)
  })

  it('maps taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(300)
  })

  it('maps entryDate to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when entryDate is empty', () => {
    expect(transformExpense(makeExpense({ entryDate: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
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
