import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MoneybirdReceipt } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/expense'

function makeReceipt(overrides: Partial<MoneybirdReceipt> = {}): MoneybirdReceipt {
  return { id: 800, contact_id: 200, date: '2024-06-01', total_price_incl_tax: '300', currency: 'EUR', ...overrides }
}

describe('transformExpense (moneybird)', () => {
  it('maps id and contactId', () => {
    expect(transformExpense(makeReceipt()).id).toBe('800')
    expect(transformExpense(makeReceipt()).contactId).toBe('200')
  })
  it('maps totalAmount', () => { expect(transformExpense(makeReceipt()).totalAmount).toBe(300) })
  it('maps currency and postedAt', () => {
    expect(transformExpense(makeReceipt()).currency).toBe('EUR')
    expect(transformExpense(makeReceipt()).postedAt).toEqual(new Date('2024-06-01'))
  })
  it('passes raw as metadata', () => {
    const raw = makeReceipt()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeReceipt())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
