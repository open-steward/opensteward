import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type SmaccExpense } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/expense'

function makeRaw(overrides: Partial<SmaccExpense> = {}): SmaccExpense {
  return {
    id: 'exp-1',
    date: '2024-05-20',
    name: 'Business travel',
    amount: 300,
    currency: 'EUR',
    account_id: 'acc-10',
    contact_id: 'c-7',
    ...overrides,
  }
}

describe('smacc transformExpense', () => {
  it('maps id to id', () => {
    expect(transformExpense(makeRaw()).id).toBe('exp-1')
  })

  it('maps name to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Business travel')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(300)
  })

  it('maps currency to currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('EUR')
  })

  it('maps account_id to accountId', () => {
    expect(transformExpense(makeRaw()).accountId).toBe('acc-10')
  })

  it('maps contact_id to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('c-7')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-05-20'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
