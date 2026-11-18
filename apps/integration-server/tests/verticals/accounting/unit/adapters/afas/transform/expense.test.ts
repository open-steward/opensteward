import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type AfasExpenseClaim,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<AfasExpenseClaim> = {}): AfasExpenseClaim {
  return {
    DeclarationNr: 'EXP-001',
    EmployeeId: 'EMP-001',
    Description: 'Travel expenses',
    AmtTotal: 300,
    AmtTax: 30,
    CurrencyId: 'EUR',
    DeclarationDate: '2024-01-20',
    ApprovalDate: '2024-01-22',
    PaymentDate: '2024-01-25',
    Status: 'P',
    ...overrides,
  }
}

describe('transformExpense (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EXP-001')
    expect(result.name).toBe('Travel expenses')
    expect(result.userId).toBe('EMP-001')
    expect(result.currency).toBe('EUR')
    // AmtTotal=300 → toMinorUnits → 30000
    expect(result.totalAmount).toBe(30000)
    // AmtTax=30 → toMinorUnits → 3000
    expect(result.taxAmount).toBe(3000)
  })

  it('parses dates as Date objects', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
    expect(result.approvedAt).toEqual(new Date('2024-01-22'))
    expect(result.reimbursedAt).toEqual(new Date('2024-01-25'))
  })

  it('handles missing optional dates gracefully', () => {
    const result = transformExpense(makeRaw({ ApprovalDate: null, PaymentDate: null }))
    expect(result.approvedAt).toBeUndefined()
    expect(result.reimbursedAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
