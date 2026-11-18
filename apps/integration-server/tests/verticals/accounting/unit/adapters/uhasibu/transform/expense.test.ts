import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type UhasibuExpense } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/expense'

function makeRaw(overrides: Partial<UhasibuExpense> = {}): UhasibuExpense {
  return {
    id: 'ue-1',
    date: '2024-05-15',
    name: 'Office supplies',
    amount: 200,
    currency: 'KES',
    account_id: 'acc-5',
    contact_id: 'c-3',
    ...overrides,
  }
}

describe('uhasibu transformExpense', () => {
  it('maps id to id', () => {
    expect(transformExpense(makeRaw()).id).toBe('ue-1')
  })

  it('maps name to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Office supplies')
  })

  it('maps amount to totalAmount', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(200)
  })

  it('maps currency to currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('KES')
  })

  it('maps account_id to accountId', () => {
    expect(transformExpense(makeRaw()).accountId).toBe('acc-5')
  })

  it('maps contact_id to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('c-3')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-05-15'))
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
