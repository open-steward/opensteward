import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type HoldedExpense,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/expense'

function makeExpense(overrides: Partial<HoldedExpense> = {}): HoldedExpense {
  return {
    id: 'exp-001',
    name: 'Material de oficina',
    accountId: 'acc-6000',
    contact: 'contact-3',
    currency: 'EUR',
    tax: 31.5,
    total: 181.5,
    date: 1708041600, // 2024-02-16
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Material de oficina')
  })

  it('maps accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc-6000')
  })

  it('maps contact to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('contact-3')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(18150)
  })

  it('maps tax to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(3150)
  })

  it('maps date (unix timestamp) to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.postedAt).toEqual(new Date(1708041600 * 1000))
  })

  it('returns undefined postedAt when date is 0', () => {
    expect(transformExpense(makeExpense({ date: 0 })).postedAt).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformExpense(makeExpense({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when contact is empty', () => {
    expect(transformExpense(makeExpense({ contact: '' })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when tax is 0', () => {
    expect(transformExpense(makeExpense({ tax: 0 })).taxAmount).toBeUndefined()
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
