import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type NetSuiteExpense } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/expense'

function makeExpense(overrides: Partial<NetSuiteExpense> = {}): NetSuiteExpense {
  return { id: 700, entity: 50, total: 300, currency: 'USD', tranDate: '2024-06-01', ...overrides }
}

describe('transformExpense (netsuite)', () => {
  it('maps id and userId', () => {
    expect(transformExpense(makeExpense()).id).toBe('700')
    expect(transformExpense(makeExpense()).userId).toBe('50')
  })
  it('maps totalAmount', () => { expect(transformExpense(makeExpense()).totalAmount).toBe(300) })
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
