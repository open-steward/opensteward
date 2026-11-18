import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type CmicExpense } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/expense'

function makeExpense(overrides: Partial<CmicExpense> = {}): CmicExpense {
  return {
    ExpenseId: 'EXP-001',
    Description: 'Site fuel costs',
    Amount: 450,
    Currency: 'USD',
    ExpenseDate: '2024-03-12',
    ProjectCode: 'PRJ-001',
    CostCode: 'CC-FUEL',
    EmployeeId: 'EMP-100',
    ...overrides,
  }
}

describe('transformExpense (CMiC)', () => {
  it('maps id from ExpenseId', () => {
    expect(transformExpense(makeExpense()).id).toBe('EXP-001')
  })

  it('maps amount and currency', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(450)
    expect(result.currency).toBe('USD')
  })

  it('maps description as name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Site fuel costs')
  })

  it('parses ExpenseDate as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-12'))
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
