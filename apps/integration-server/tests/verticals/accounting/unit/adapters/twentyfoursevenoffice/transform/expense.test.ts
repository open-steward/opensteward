import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type TwentyFourSevenExpense,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/expense'

function makeExpense(overrides: Partial<TwentyFourSevenExpense> = {}): TwentyFourSevenExpense {
  return {
    id: 'exp-001',
    description: 'Office supplies',
    contactId: 'contact-3',
    currency: 'NOK',
    date: '2024-02-15',
    totalAmount: 1500,
    taxAmount: 300,
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

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('NOK')
  })

  it('maps totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1500)
  })

  it('maps taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(300)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when contactId is empty', () => {
    expect(transformExpense(makeExpense({ contactId: '' })).contactId).toBeUndefined()
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
