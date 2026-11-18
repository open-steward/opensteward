import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type BillomatExpense,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/expense'

function makeExpense(overrides: Partial<BillomatExpense> = {}): BillomatExpense {
  return {
    id: 'exp-001',
    description: 'Büromaterial',
    supplier_id: 'supplier-3',
    currency_code: 'EUR',
    total_gross: 1190,
    tax_amount: 190,
    date: '2024-02-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Büromaterial')
  })

  it('maps supplier_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('supplier-3')
  })

  it('maps currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps total_gross to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1190)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(190)
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

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
