import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type PandleExpense,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/expense'

function makeExpense(overrides: Partial<PandleExpense> = {}): PandleExpense {
  return {
    id: 6001,
    description: 'Office supplies',
    supplier_id: 30,
    currency: 'GBP',
    net_amount: 100,
    tax_amount: 20,
    total_amount: 120,
    date: '2024-02-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('6001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps supplier_id to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('30')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('GBP')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(120)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(20)
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

  it('returns undefined contactId when supplier_id is 0', () => {
    expect(transformExpense(makeExpense({ supplier_id: 0 })).contactId).toBeUndefined()
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
