import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AcumaticaExpense } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/expense'

function makeExpense(overrides: Partial<AcumaticaExpense> = {}): AcumaticaExpense {
  return {
    RefNbr: 'EXP001',
    ExpenseDate: '2024-03-10',
    Description: 'Business travel',
    CuryTotalAmt: 350,
    CuryID: 'USD',
    EmployeeID: 'EMP001',
    Status: 'Approved',
    ...overrides,
  }
}

describe('transformExpense (Acumatica)', () => {
  it('maps id from RefNbr', () => {
    expect(transformExpense(makeExpense()).id).toBe('EXP001')
  })

  it('maps totalAmount from CuryTotalAmt', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(350)
  })

  it('maps currency from CuryID', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps name from Description', () => {
    expect(transformExpense(makeExpense()).name).toBe('Business travel')
  })

  it('parses ExpenseDate as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-10'))
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
