import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type FikenExpense,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/expense'

function makeExpense(overrides: Partial<FikenExpense> = {}): FikenExpense {
  return {
    purchaseId: 701,
    identifier: 'EXP-701',
    supplierId: 88,
    currency: 'NOK',
    net: 4000,
    vat: 1000,
    gross: 5000,
    date: '2024-07-01',
    description: 'Travel expense',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps purchaseId to id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('701')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Travel expense')
  })

  it('falls back to identifier when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBe('EXP-701')
  })

  it('maps supplierId to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('88')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('NOK')
  })

  it('maps gross to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(5000)
  })

  it('maps vat to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(1000)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined contactId when supplierId is zero', () => {
    expect(transformExpense(makeExpense({ supplierId: 0 })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when vat is zero', () => {
    expect(transformExpense(makeExpense({ vat: 0 })).taxAmount).toBeUndefined()
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
