import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type BexioExpense,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/expense'

function makeExpense(overrides: Partial<BexioExpense> = {}): BexioExpense {
  return {
    id: 901,
    name: 'Office supplies',
    account_id: 6000,
    contact_id: 42,
    currency_code: 'CHF',
    tax_amount: 7.7,
    total_amount: 107.7,
    date: '2024-05-20',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('901')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('6000')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('CHF')
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(770)
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(10770)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-20'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when empty', () => {
    expect(transformExpense(makeExpense({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when contact_id is null', () => {
    expect(transformExpense(makeExpense({ contact_id: null })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when tax_amount is zero', () => {
    expect(transformExpense(makeExpense({ tax_amount: 0 })).taxAmount).toBeUndefined()
  })

  it('returns undefined currency when currency_code is empty', () => {
    expect(transformExpense(makeExpense({ currency_code: '' })).currency).toBeUndefined()
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
