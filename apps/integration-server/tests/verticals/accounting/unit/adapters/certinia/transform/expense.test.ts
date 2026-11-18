import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type CertiniaExpense } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/expense'

function makeExpense(overrides: Partial<CertiniaExpense> = {}): CertiniaExpense {
  return {
    Id: 'EXP000000001',
    Name: 'EXP-2024-001',
    Expense_Date__c: '2024-03-05',
    Description__c: 'Business travel',
    Amount__c: 1200,
    Employee__c: 'EMP-001',
    ...overrides,
  }
}

describe('transformExpense (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('EXP000000001')
    expect(result.totalAmount).toBe(1200)
    expect(result.name).toBe('Business travel')
    expect(result.contactId).toBe('EMP-001')
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
    const result = transformExpense(makeExpense({ Description__c: '' }))
    expect(result.name).toBeUndefined()
  })

  it('handles missing employee gracefully', () => {
    const result = transformExpense(makeExpense({ Employee__c: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
