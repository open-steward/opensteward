import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type ProcountorExpense,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/expense'

function makeExpense(overrides: Partial<ProcountorExpense> = {}): ProcountorExpense {
  return {
    id: 8001,
    description: 'Office supplies',
    partnerId: 400,
    currency: 'EUR',
    sum: 1250,
    vatAmount: 250,
    date: '2024-02-01',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('8001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps partnerId to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('400')
  })

  it('maps sum to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1250)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(250)
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps date to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-01')).toBe(true)
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when partnerId is 0', () => {
    expect(transformExpense(makeExpense({ partnerId: 0 })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when vatAmount is 0', () => {
    expect(transformExpense(makeExpense({ vatAmount: 0 })).taxAmount).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    expect(transformExpense(makeExpense({ currency: '' })).currency).toBeUndefined()
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
