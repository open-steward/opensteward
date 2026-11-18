import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type TwinfieldExpense,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/expense'

function makeExpense(overrides: Partial<TwinfieldExpense> = {}): TwinfieldExpense {
  return {
    code: 'EXP-001',
    description: 'Office supplies',
    dim1: '4200',
    dim2: 'CRE-005',
    currency: 'EUR',
    valueInc: 150,
    vatValue: 26.45,
    date: '2024-06-10',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps code to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('EXP-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps dim1 to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('4200')
  })

  it('maps dim2 to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('CRE-005')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps valueInc to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(15000)
  })

  it('maps vatValue to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(2645)
  })

  it('maps date to postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-06-10'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
  })

  it('returns undefined taxAmount when vatValue is zero', () => {
    expect(transformExpense(makeExpense({ vatValue: 0 })).taxAmount).toBeUndefined()
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
