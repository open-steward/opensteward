import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MyobExpense } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/expense'

function makeExpense(overrides: Partial<MyobExpense> = {}): MyobExpense {
  return { UID: 'uid-8', Supplier: { UID: 'sup-1' }, Date: '2024-06-01', TotalAmount: 500, TotalTax: 50, ...overrides }
}

describe('transformExpense (myob)', () => {
  it('maps id and contactId', () => {
    expect(transformExpense(makeExpense()).id).toBe('uid-8')
    expect(transformExpense(makeExpense()).contactId).toBe('sup-1')
  })
  it('maps totalAmount and taxAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(500)
    expect(transformExpense(makeExpense()).taxAmount).toBe(50)
  })
  it('maps postedAt', () => { expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-06-01')) })
  it('passes raw as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
