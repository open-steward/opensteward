import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FoundationExpense } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/expense'

function makeExpense(overrides: Partial<FoundationExpense> = {}): FoundationExpense {
  return {
    ExpenseId: 'EXP-001',
    ExpenseDate: '2024-03-05',
    Description: 'Tool rental',
    Amount: 750,
    JobNumber: 'JOB-100',
    VendorId: 'VEND-10',
    ...overrides,
  }
}

describe('transformExpense (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('EXP-001')
    expect(result.totalAmount).toBe(750)
    expect(result.name).toBe('Tool rental')
    expect(result.contactId).toBe('VEND-10')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('handles missing description gracefully', () => {
    const result = transformExpense(makeExpense({ Description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('handles missing vendor gracefully', () => {
    const result = transformExpense(makeExpense({ VendorId: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
